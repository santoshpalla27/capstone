# Capstone Platform - Stage 1

A resilient Control Plane with React frontend, Spring Boot backend, and full observability.

## Quick Start

```powershell
# Start main stack (infra + backend + frontend)
docker compose up -d

# Start monitoring (optional)
docker compose -f docker-compose.monitoring.yml up -d
```

## Endpoints

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8080 |
| Health | http://localhost:8080/health |
| Grafana | http://localhost:3001 |

## Architecture

```
Frontend (React) ←→ Backend (Spring Boot) → Redis/MySQL/Kafka
                            ↑
            Monitoring (OTEL/Prometheus/Grafana)
```

> **Note:** Stage 1 uses Zookeeper-based Kafka for tooling compatibility. KRaft mode planned for Stage 2.

## Stage 2 (Future)
- API Gateway + Polyglot Microservices (Go, Java, Python, Node.js)
