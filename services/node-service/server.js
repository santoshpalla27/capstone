const express = require('express');
const { Kafka } = require('kafkajs');
const CircuitBreaker = require('opossum');
const promClient = require('prom-client');
const axios = require('axios');
const winston = require('winston');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3004;
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'kafka:29092').split(',');
const GO_SERVICE_URL = process.env.GO_SERVICE_URL || 'http://go-service:3001';
const JAVA_SERVICE_URL = process.env.JAVA_SERVICE_URL || 'http://java-service:3002';
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://python-service:3003';

const startTime = Date.now();
let kafkaReady = false;
let kafkaProducer = null;

// Logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [new winston.transports.Console()]
});

// Prometheus metrics
const register = new promClient.Registry();
promClient.collectDefaultMetrics({ register });

const requestCounter = new promClient.Counter({
    name: 'node_service_requests_total',
    help: 'Total requests by endpoint and status',
    labelNames: ['endpoint', 'status']
});
register.registerMetric(requestCounter);

const kafkaLatency = new promClient.Histogram({
    name: 'node_service_kafka_latency_seconds',
    help: 'Kafka operation latency',
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5]
});
register.registerMetric(kafkaLatency);

// Kafka setup with retry
const kafka = new Kafka({
    clientId: 'node-service',
    brokers: KAFKA_BROKERS,
    retry: {
        initialRetryTime: 100,
        retries: 8,
        maxRetryTime: 30000
    },
    connectionTimeout: 10000,
    requestTimeout: 30000
});

async function connectKafka() {
    const producer = kafka.producer();

    for (let i = 0; i < 10; i++) {
        try {
            await producer.connect();
            kafkaProducer = producer;
            kafkaReady = true;
            logger.info('Kafka producer connected');
            return;
        } catch (err) {
            logger.warn(`Kafka connect attempt ${i + 1} failed: ${err.message}`);
            await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, i), 30000)));
        }
    }

    logger.error('Kafka connection failed after retries - running in degraded mode');
}

// Connect Kafka in background
connectKafka().catch(err => logger.error('Kafka init error:', err));

// Circuit breaker for Kafka
const kafkaBreaker = new CircuitBreaker(
    async (topic, message) => {
        if (!kafkaProducer) throw new Error('Kafka not connected');
        const start = Date.now();
        await kafkaProducer.send({
            topic,
            messages: [{ value: JSON.stringify(message) }]
        });
        kafkaLatency.observe((Date.now() - start) / 1000);
    },
    {
        timeout: 10000,
        errorThresholdPercentage: 50,
        resetTimeout: 30000,
        volumeThreshold: 5
    }
);

kafkaBreaker.on('open', () => logger.warn('Kafka circuit breaker OPEN'));
kafkaBreaker.on('halfOpen', () => logger.info('Kafka circuit breaker HALF-OPEN'));
kafkaBreaker.on('close', () => logger.info('Kafka circuit breaker CLOSED'));

// Middleware
app.use((req, res, next) => {
    res.on('finish', () => {
        const status = res.statusCode < 400 ? 'success' : 'error';
        requestCounter.inc({ endpoint: req.path, status });
    });
    next();
});

// Health endpoints
app.get('/health', (req, res) => {
    res.json({
        status: 'UP',
        service: 'node-service',
        timestamp: new Date().toISOString(),
        uptime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`
    });
});

app.get('/ready', (req, res) => {
    const status = kafkaReady ? 'UP' : 'DEGRADED';
    res.json({
        status,
        service: 'node-service',
        kafka: kafkaReady,
        timestamp: new Date().toISOString()
    });
});

// API endpoints
app.get('/api/v1/check-kafka', async (req, res) => {
    if (!kafkaProducer) {
        return res.status(503).json({
            status: 'DOWN',
            canConnect: false,
            error: 'Kafka producer not initialized'
        });
    }

    const start = Date.now();
    try {
        await kafkaBreaker.fire('node-service-health', { ping: Date.now() });
        const latency = Date.now() - start;

        res.json({
            status: 'UP',
            canConnect: true,
            latency: `${latency}ms`,
            brokers: KAFKA_BROKERS,
            circuitBreaker: kafkaBreaker.opened ? 'OPEN' : 'CLOSED'
        });
    } catch (err) {
        res.status(503).json({
            status: 'DOWN',
            canConnect: false,
            error: err.message,
            circuitBreaker: kafkaBreaker.opened ? 'OPEN' : 'CLOSED'
        });
    }
});

app.get('/api/v1/check-services', async (req, res) => {
    const services = {
        go: GO_SERVICE_URL,
        java: JAVA_SERVICE_URL,
        python: PYTHON_SERVICE_URL
    };

    const results = {};

    for (const [name, url] of Object.entries(services)) {
        const start = Date.now();
        try {
            await axios.get(`${url}/health`, { timeout: 5000 });
            results[name] = { status: 'UP', latency: `${Date.now() - start}ms` };
        } catch (err) {
            results[name] = {
                status: 'DOWN',
                error: err.message,
                latency: `${Date.now() - start}ms`
            };
        }
    }

    res.json({ service: 'node-service', services: results });
});

app.get('/api/v1/info', (req, res) => {
    res.json({
        service: 'node-service',
        version: '1.0.0',
        language: 'Node.js',
        framework: 'Express',
        features: ['kafka', 'circuit-breaker', 'health-checks', 'metrics'],
        uptime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`
    });
});

app.post('/api/v1/events', async (req, res) => {
    try {
        const event = {
            ...req.body,
            timestamp: new Date().toISOString(),
            source: 'node-service'
        };

        await kafkaBreaker.fire('events', event);
        res.json({ status: 'published', topic: 'events' });
    } catch (err) {
        res.status(503).json({
            status: 'failed',
            error: err.message,
            circuitBreaker: kafkaBreaker.opened ? 'OPEN' : 'CLOSED'
        });
    }
});

// Prometheus metrics
app.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not Found' });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    if (kafkaProducer) {
        await kafkaProducer.disconnect();
    }
    process.exit(0);
});

app.listen(PORT, () => {
    logger.info(`Node Service running on port ${PORT}`);
});

module.exports = app;
