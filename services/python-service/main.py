import os
import asyncio
import logging
import time
from datetime import datetime, timezone
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import ServerSelectionTimeoutError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

# Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger(__name__)

# Prometheus metrics
REQUEST_COUNT = Counter('python_service_requests_total', 'Total requests', ['endpoint', 'status'])
REQUEST_LATENCY = Histogram('python_service_request_latency_seconds', 'Request latency', ['endpoint'])
MONGO_STATUS = Gauge('python_service_mongo_status', 'MongoDB connection status (1=up, 0=down)')

# Global state
mongo_client = None
mongo_ready = False
start_time = time.time()

# Configuration
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://admin:mongopass@localhost:27017/python_service_db?authSource=admin')
PORT = int(os.getenv('PORT', 3003))

GO_SERVICE_URL = os.getenv('GO_SERVICE_URL', 'http://go-service:3001')
JAVA_SERVICE_URL = os.getenv('JAVA_SERVICE_URL', 'http://java-service:3002')
NODE_SERVICE_URL = os.getenv('NODE_SERVICE_URL', 'http://node-service:3004')


@retry(
    stop=stop_after_attempt(5),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type(ServerSelectionTimeoutError)
)
async def connect_mongo():
    """Connect to MongoDB with retry logic."""
    global mongo_client, mongo_ready
    
    client = AsyncIOMotorClient(
        MONGO_URI,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=10000,
        retryWrites=True,
        retryReads=True
    )
    
    # Verify connection
    await client.admin.command('ping')
    mongo_client = client
    mongo_ready = True
    MONGO_STATUS.set(1)
    logger.info("MongoDB connected successfully")
    return client


async def init_mongo():
    """Initialize MongoDB connection in background."""
    global mongo_ready
    try:
        await connect_mongo()
    except Exception as e:
        logger.error(f"MongoDB connection failed after retries: {e}")
        mongo_ready = False
        MONGO_STATUS.set(0)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    asyncio.create_task(init_mongo())
    yield
    # Shutdown
    if mongo_client:
        mongo_client.close()


app = FastAPI(
    title="Python Service",
    version="1.0.0",
    lifespan=lifespan
)


@app.middleware("http")
async def metrics_middleware(request, call_next):
    start = time.time()
    response = await call_next(request)
    latency = time.time() - start
    
    endpoint = request.url.path
    status = 'success' if response.status_code < 400 else 'error'
    
    REQUEST_COUNT.labels(endpoint=endpoint, status=status).inc()
    REQUEST_LATENCY.labels(endpoint=endpoint).observe(latency)
    
    return response


@app.get("/health")
async def health():
    return {
        "status": "UP",
        "service": "python-service",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime": f"{time.time() - start_time:.2f}s"
    }


@app.get("/ready")
async def ready():
    status = "UP" if mongo_ready else "DEGRADED"
    return {
        "status": status,
        "service": "python-service",
        "mongo": mongo_ready,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get("/api/v1/check-mongo")
async def check_mongo():
    if mongo_client is None:
        MONGO_STATUS.set(0)
        return JSONResponse(
            status_code=503,
            content={"status": "DOWN", "canConnect": False, "error": "Client not initialized"}
        )
    
    start = time.time()
    try:
        result = await mongo_client.admin.command('ping')
        latency = time.time() - start
        
        # Get server info
        server_info = await mongo_client.admin.command('serverStatus')
        topology = "replica_set" if 'repl' in server_info else "standalone"
        
        MONGO_STATUS.set(1)
        return {
            "status": "UP",
            "canConnect": True,
            "latency": f"{latency*1000:.2f}ms",
            "topology": topology
        }
    except Exception as e:
        MONGO_STATUS.set(0)
        return JSONResponse(
            status_code=503,
            content={"status": "DOWN", "canConnect": False, "error": str(e)}
        )


@app.get("/api/v1/check-services")
async def check_services():
    services = {
        "go": GO_SERVICE_URL,
        "java": JAVA_SERVICE_URL,
        "node": NODE_SERVICE_URL
    }
    
    results = {}
    async with httpx.AsyncClient(timeout=5.0) as client:
        for name, url in services.items():
            start = time.time()
            try:
                response = await client.get(f"{url}/health")
                latency = time.time() - start
                results[name] = {
                    "status": "UP" if response.status_code == 200 else "DOWN",
                    "latency": f"{latency*1000:.2f}ms"
                }
            except Exception as e:
                results[name] = {
                    "status": "DOWN",
                    "error": str(e),
                    "latency": f"{(time.time() - start)*1000:.2f}ms"
                }
    
    return {"service": "python-service", "services": results}


@app.get("/api/v1/info")
async def info():
    return {
        "service": "python-service",
        "version": "1.0.0",
        "language": "Python",
        "framework": "FastAPI",
        "features": ["mongodb", "async", "retry", "health-checks", "metrics"],
        "uptime": f"{time.time() - start_time:.2f}s"
    }


@app.post("/api/v1/data")
async def create_data(data: dict):
    if not mongo_ready or mongo_client is None:
        raise HTTPException(status_code=503, detail="MongoDB not available")
    
    data["createdAt"] = datetime.now(timezone.utc)
    result = await mongo_client.python_service_db.data.insert_one(data)
    
    return {"id": str(result.inserted_id), "status": "created"}


@app.get("/api/v1/data")
async def get_data():
    if not mongo_ready or mongo_client is None:
        raise HTTPException(status_code=503, detail="MongoDB not available")
    
    cursor = mongo_client.python_service_db.data.find()
    results = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(doc)
    
    return {"data": results, "count": len(results)}


@app.get("/metrics")
async def metrics():
    return JSONResponse(
        content=generate_latest().decode('utf-8'),
        media_type=CONTENT_TYPE_LATEST
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
