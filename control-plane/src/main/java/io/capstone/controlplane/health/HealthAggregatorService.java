package io.capstone.controlplane.health;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Aggregates health from all infrastructure components.
 * 
 * RESILIENCE GUARANTEES:
 * - Survives partial and total infrastructure failure
 * - Caches health snapshots to prevent health storms
 * - Never blocks on unhealthy components
 * - DEGRADED state is acceptable for readiness
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HealthAggregatorService {

    private final DataSource dataSource;
    private final StringRedisTemplate redisTemplate;
    private final WebSocketPublisher webSocketPublisher;
    
    @Value("${spring.kafka.bootstrap-servers:localhost:9092}")
    private String kafkaBootstrapServers;
    
    // SafeModeService is set via setter injection to break circular dependency
    private SafeModeService safeModeService;
    
    public void setSafeModeService(SafeModeService safeModeService) {
        this.safeModeService = safeModeService;
    }
    
    // Cached health snapshot - served on every request
    private final AtomicReference<HealthSnapshot> cachedSnapshot = new AtomicReference<>(
        new HealthSnapshot("UNKNOWN", System.currentTimeMillis(), Map.of(), false)
    );

    /**
     * Get cached aggregated health status - never recomputes on request
     */
    public Map<String, Object> getAggregatedHealth() {
        HealthSnapshot snapshot = cachedSnapshot.get();
        
        Map<String, Object> health = new LinkedHashMap<>();
        health.put("status", snapshot.status());
        health.put("timestamp", snapshot.timestamp());
        health.put("cached", true);
        
        Map<String, Object> components = new LinkedHashMap<>();
        snapshot.components().forEach((name, ch) -> {
            components.put(name, Map.of(
                "status", ch.status(),
                "lastCheck", ch.lastCheck(),
                "message", ch.message() != null ? ch.message() : ""
            ));
        });
        health.put("components", components);
        
        return health;
    }

    /**
     * Check if system is ready to receive traffic.
     * RELAXED SEMANTICS: DEGRADED is acceptable - we can serve partial traffic
     */
    public boolean isReady() {
        HealthSnapshot snapshot = cachedSnapshot.get();
        // Ready if we have ANY healthy component (not just MySQL)
        // Control plane philosophy: serve what we can
        return snapshot.ready() || "UP".equals(snapshot.status()) || "DEGRADED".equals(snapshot.status());
    }

    /**
     * Periodic health check - updates cached snapshot
     * Runs every 5 seconds, results are cached and served
     */
    @Scheduled(fixedRateString = "${health.check.interval:5000}")
    public void checkHealth() {
        Map<String, ComponentHealth> components = new LinkedHashMap<>();
        
        // Check each component independently - failures are isolated
        components.put("mysql", checkMySQL());
        components.put("redis", checkRedis());
        components.put("kafka", checkKafka());
        
        // Calculate overall status
        String overallStatus = calculateOverallStatus(components);
        
        // Ready if at least one critical component is up
        boolean ready = components.values().stream()
            .anyMatch(ch -> "UP".equals(ch.status()));
        
        // Update cached snapshot atomically
        HealthSnapshot newSnapshot = new HealthSnapshot(
            overallStatus, 
            System.currentTimeMillis(), 
            components,
            ready
        );
        cachedSnapshot.set(newSnapshot);
        
        // Publish health update via WebSocket
        webSocketPublisher.publishHealthUpdates(getAggregatedHealth());
        
        // Autonomous safe-mode evaluation based on health status
        if (safeModeService != null) {
            safeModeService.evaluateAndTrigger(overallStatus);
        }
        
        log.debug("Health snapshot updated. Status: {}, Ready: {}", overallStatus, ready);
    }

    private ComponentHealth checkMySQL() {
        try (Connection conn = dataSource.getConnection()) {
            if (conn.isValid(3)) {
                return new ComponentHealth("UP", System.currentTimeMillis(), "Connected");
            } else {
                return new ComponentHealth("DOWN", System.currentTimeMillis(), "Invalid connection");
            }
        } catch (Exception e) {
            log.warn("MySQL health check failed: {}", e.getMessage());
            return new ComponentHealth("DOWN", System.currentTimeMillis(), e.getMessage());
        }
    }

    private ComponentHealth checkRedis() {
        try {
            String pong = redisTemplate.getConnectionFactory().getConnection().ping();
            if ("PONG".equalsIgnoreCase(pong)) {
                return new ComponentHealth("UP", System.currentTimeMillis(), "Connected");
            } else {
                return new ComponentHealth("DOWN", System.currentTimeMillis(), "Unexpected response");
            }
        } catch (Exception e) {
            log.warn("Redis health check failed: {}", e.getMessage());
            return new ComponentHealth("DOWN", System.currentTimeMillis(), e.getMessage());
        }
    }

    /**
     * REAL Kafka health check - validates broker connectivity
     * Uses AdminClient to fetch cluster metadata (lightweight operation)
     */
    private ComponentHealth checkKafka() {
        Properties props = new Properties();
        props.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, kafkaBootstrapServers);
        props.put(AdminClientConfig.REQUEST_TIMEOUT_MS_CONFIG, "3000");
        props.put(AdminClientConfig.DEFAULT_API_TIMEOUT_MS_CONFIG, "5000");
        
        try (AdminClient adminClient = AdminClient.create(props)) {
            // Lightweight check: fetch cluster ID (metadata operation)
            String clusterId = adminClient.describeCluster()
                .clusterId()
                .get(3, TimeUnit.SECONDS);
            
            if (clusterId != null && !clusterId.isEmpty()) {
                return new ComponentHealth("UP", System.currentTimeMillis(), 
                    "Connected to cluster: " + clusterId.substring(0, Math.min(8, clusterId.length())) + "...");
            } else {
                return new ComponentHealth("DEGRADED", System.currentTimeMillis(), "Cluster ID unavailable");
            }
        } catch (Exception e) {
            log.warn("Kafka health check failed: {}", e.getMessage());
            return new ComponentHealth("DOWN", System.currentTimeMillis(), 
                "Cannot connect: " + e.getMessage());
        }
    }

    private String calculateOverallStatus(Map<String, ComponentHealth> components) {
        if (components.isEmpty()) {
            return "UNKNOWN";
        }
        
        long upCount = components.values().stream()
            .filter(ch -> "UP".equals(ch.status()))
            .count();
        
        long downCount = components.values().stream()
            .filter(ch -> "DOWN".equals(ch.status()))
            .count();
        
        if (upCount == components.size()) return "UP";
        if (downCount == components.size()) return "DOWN";
        return "DEGRADED";
    }

    // Immutable records for thread-safety
    public record ComponentHealth(String status, long lastCheck, String message) {}
    
    public record HealthSnapshot(
        String status, 
        long timestamp, 
        Map<String, ComponentHealth> components,
        boolean ready
    ) {}
}
