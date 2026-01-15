package io.capstone.service.controller;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

@RestController
@RequiredArgsConstructor
@Slf4j
public class ServiceController {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final RestTemplate restTemplate = new RestTemplate();
    private final Instant startTime = Instant.now();
    
    private final AtomicBoolean kafkaReady = new AtomicBoolean(false);

    @Value("${spring.kafka.bootstrap-servers:kafka:29092}")
    private String kafkaBootstrapServers;

    @Value("${services.go.url:http://go-service:3001}")
    private String goServiceUrl;

    @Value("${services.python.url:http://python-service:3003}")
    private String pythonServiceUrl;

    @Value("${services.node.url:http://node-service:3004}")
    private String nodeServiceUrl;

    @GetMapping("/health")
    public ResponseEntity<Map<String, Object>> health() {
        return ResponseEntity.ok(Map.of(
            "status", "UP",
            "service", "java-service",
            "timestamp", Instant.now().toString(),
            "uptime", java.time.Duration.between(startTime, Instant.now()).toString()
        ));
    }

    @GetMapping("/ready")
    public ResponseEntity<Map<String, Object>> ready() {
        String status = kafkaReady.get() ? "UP" : "DEGRADED";
        return ResponseEntity.ok(Map.of(
            "status", status,
            "service", "java-service",
            "kafka", kafkaReady.get(),
            "timestamp", Instant.now().toString()
        ));
    }

    @GetMapping("/api/v1/check-kafka")
    @CircuitBreaker(name = "kafka", fallbackMethod = "kafkaFallback")
    @Retry(name = "kafka")
    public ResponseEntity<Map<String, Object>> checkKafka() {
        long start = System.currentTimeMillis();
        
        try {
            // Send a test message
            kafkaTemplate.send("java-service-health", "ping-" + System.currentTimeMillis()).get();
            kafkaReady.set(true);
            
            long latency = System.currentTimeMillis() - start;
            return ResponseEntity.ok(Map.of(
                "status", "UP",
                "canConnect", true,
                "latency", latency + "ms",
                "bootstrapServers", kafkaBootstrapServers
            ));
        } catch (Exception e) {
            kafkaReady.set(false);
            throw new RuntimeException("Kafka check failed: " + e.getMessage());
        }
    }

    public ResponseEntity<Map<String, Object>> kafkaFallback(Exception e) {
        kafkaReady.set(false);
        return ResponseEntity.status(503).body(Map.of(
            "status", "DOWN",
            "canConnect", false,
            "error", e.getMessage(),
            "circuitBreaker", "OPEN"
        ));
    }

    @GetMapping("/api/v1/check-services")
    public ResponseEntity<Map<String, Object>> checkServices() {
        Map<String, Map<String, Object>> results = new HashMap<>();
        
        results.put("go", checkService(goServiceUrl));
        results.put("python", checkService(pythonServiceUrl));
        results.put("node", checkService(nodeServiceUrl));
        
        return ResponseEntity.ok(Map.of(
            "service", "java-service",
            "services", results
        ));
    }

    private Map<String, Object> checkService(String url) {
        long start = System.currentTimeMillis();
        try {
            restTemplate.getForEntity(url + "/health", String.class);
            return Map.of(
                "status", "UP",
                "latency", (System.currentTimeMillis() - start) + "ms"
            );
        } catch (Exception e) {
            return Map.of(
                "status", "DOWN",
                "error", e.getMessage(),
                "latency", (System.currentTimeMillis() - start) + "ms"
            );
        }
    }

    @GetMapping("/api/v1/info")
    public ResponseEntity<Map<String, Object>> info() {
        return ResponseEntity.ok(Map.of(
            "service", "java-service",
            "version", "1.0.0",
            "language", "Java",
            "framework", "Spring Boot 3.2",
            "features", new String[]{"kafka", "circuit-breaker", "retry", "metrics"},
            "uptime", java.time.Duration.between(startTime, Instant.now()).toString()
        ));
    }

    @PostMapping("/api/v1/events")
    @CircuitBreaker(name = "kafka", fallbackMethod = "publishFallback")
    public ResponseEntity<Map<String, Object>> publishEvent(@RequestBody Map<String, Object> event) {
        event.put("timestamp", Instant.now().toString());
        event.put("source", "java-service");
        
        kafkaTemplate.send("events", event.toString());
        
        return ResponseEntity.ok(Map.of(
            "status", "published",
            "topic", "events"
        ));
    }

    public ResponseEntity<Map<String, Object>> publishFallback(Map<String, Object> event, Exception e) {
        return ResponseEntity.status(503).body(Map.of(
            "status", "failed",
            "error", "Kafka unavailable",
            "circuitBreaker", "OPEN"
        ));
    }
}
