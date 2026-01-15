const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const CircuitBreaker = require('opossum');
const promClient = require('prom-client');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 8000;

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const httpRequestDuration = new promClient.Histogram({
  name: 'gateway_http_request_duration_seconds',
  help: 'Duration of HTTP requests through the gateway',
  labelNames: ['method', 'route', 'status_code', 'service'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
register.registerMetric(httpRequestDuration);

const circuitBreakerState = new promClient.Gauge({
  name: 'gateway_circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['service']
});
register.registerMetric(circuitBreakerState);

const serviceRequestCount = new promClient.Counter({
  name: 'gateway_service_requests_total',
  help: 'Total requests per service',
  labelNames: ['service', 'status']
});
register.registerMetric(serviceRequestCount);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT) || 100,
  message: { error: 'Too many requests', retryAfter: '60s' }
});
app.use('/api/', limiter);

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const service = req.path.split('/')[2] || 'gateway';
    httpRequestDuration.observe({ method: req.method, route: req.path, status_code: res.statusCode, service }, duration);
    logger.info({ method: req.method, path: req.path, status: res.statusCode, duration: `${duration}s` });
  });
  next();
});

// Service configuration
const services = {
  go: { target: process.env.GO_SERVICE_URL || 'http://go-service:3001', timeout: 5000 },
  java: { target: process.env.JAVA_SERVICE_URL || 'http://java-service:3002', timeout: 10000 },
  python: { target: process.env.PYTHON_SERVICE_URL || 'http://python-service:3003', timeout: 5000 },
  node: { target: process.env.NODE_SERVICE_URL || 'http://node-service:3004', timeout: 5000 }
};

// Circuit breaker factory
const circuitBreakers = {};
const createBreaker = (name) => {
  const breaker = new CircuitBreaker(async (url) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), services[name].timeout);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }, {
    timeout: services[name].timeout + 1000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    volumeThreshold: 5
  });

  breaker.on('open', () => {
    logger.warn(`Circuit OPEN: ${name}`);
    circuitBreakerState.set({ service: name }, 1);
  });
  breaker.on('halfOpen', () => {
    logger.info(`Circuit HALF-OPEN: ${name}`);
    circuitBreakerState.set({ service: name }, 2);
  });
  breaker.on('close', () => {
    logger.info(`Circuit CLOSED: ${name}`);
    circuitBreakerState.set({ service: name }, 0);
  });
  
  circuitBreakerState.set({ service: name }, 0);
  return breaker;
};

Object.keys(services).forEach(name => {
  circuitBreakers[name] = createBreaker(name);
});

// Create proxy for each service
Object.entries(services).forEach(([name, config]) => {
  const proxy = createProxyMiddleware({
    target: config.target,
    changeOrigin: true,
    pathRewrite: { [`^/api/${name}`]: '' },
    timeout: config.timeout,
    proxyTimeout: config.timeout,
    onError: (err, req, res) => {
      logger.error(`Proxy error [${name}]: ${err.message}`);
      serviceRequestCount.inc({ service: name, status: 'error' });
      if (!res.headersSent) {
        res.status(502).json({ error: 'Service unavailable', service: name });
      }
    },
    onProxyRes: () => {
      serviceRequestCount.inc({ service: name, status: 'success' });
    }
  });
  
  app.use(`/api/${name}`, proxy);
  logger.info(`Route: /api/${name} -> ${config.target}`);
});

// Gateway health
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'api-gateway', timestamp: new Date().toISOString() });
});

// Gateway readiness - checks all downstream services
app.get('/ready', async (req, res) => {
  const checks = await Promise.allSettled(
    Object.entries(services).map(async ([name, config]) => {
      try {
        const result = await circuitBreakers[name].fire(`${config.target}/health`);
        return { name, status: 'UP', latency: result.latency || 0 };
      } catch (err) {
        return { name, status: 'DOWN', error: err.message };
      }
    })
  );
  
  const results = checks.map(c => c.value || { name: 'unknown', status: 'ERROR' });
  const allUp = results.every(r => r.status === 'UP');
  const anyUp = results.some(r => r.status === 'UP');
  
  res.status(anyUp ? 200 : 503).json({
    status: allUp ? 'UP' : anyUp ? 'DEGRADED' : 'DOWN',
    services: results,
    timestamp: new Date().toISOString()
  });
});

// List all services and their circuit breaker states
app.get('/gateway/services', (req, res) => {
  const serviceStatus = Object.entries(services).map(([name, config]) => ({
    name,
    target: config.target,
    circuitBreaker: circuitBreakers[name].opened ? 'OPEN' : circuitBreakers[name].halfOpen ? 'HALF_OPEN' : 'CLOSED'
  }));
  res.json({ services: serviceStatus });
});

// Prometheus metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', availableRoutes: Object.keys(services).map(s => `/api/${s}/*`) });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
});

module.exports = app;
