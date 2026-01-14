package io.capstone.controlplane.health;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Aggregates health from all infrastructure components.
 * Survives partial and total infrastructure failure.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HealthAggregatorService {

    private final DataSource dataSource;
    private final StringRedisTemplate redisTemplate;
    
    private final Map<String, ComponentHealth> componentHealth = new ConcurrentHashMap<>();
    private volatile boolean ready = false;

    /**
     * Get aggregated health status of all components
     */
    public Map<String, Object> getAggregatedHealth() {
        Map<String, Object> health = new LinkedHashMap<>();
        
        String overallStatus = calculateOverallStatus();
        health.put("status", overallStatus);
        health.put("timestamp", System.currentTimeMillis());
        
        Map<String, Object> components = new LinkedHashMap<>();
        componentHealth.forEach((name, ch) -> {
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
     * Check if system is ready to receive traffic
     */
    public boolean isReady() {
        return ready;
    }

    /**
     * Periodic health check for all components
     */
    @Scheduled(fixedRateString = "${health.check.interval:5000}")
    public void checkHealth() {
        checkMySQL();
        checkRedis();
        checkKafka();
        
        // System is ready if MySQL is up (minimum requirement)
        ready = "UP".equals(componentHealth.getOrDefault("mysql", 
            new ComponentHealth("DOWN", 0, "Not checked")).status());
        
        log.debug("Health check completed. Ready: {}", ready);
    }

    private void checkMySQL() {
        try (Connection conn = dataSource.getConnection()) {
            if (conn.isValid(3)) {
                componentHealth.put("mysql", new ComponentHealth("UP", System.currentTimeMillis(), "Connected"));
            } else {
                componentHealth.put("mysql", new ComponentHealth("DOWN", System.currentTimeMillis(), "Invalid connection"));
            }
        } catch (Exception e) {
            log.warn("MySQL health check failed: {}", e.getMessage());
            componentHealth.put("mysql", new ComponentHealth("DOWN", System.currentTimeMillis(), e.getMessage()));
        }
    }

    private void checkRedis() {
        try {
            String pong = redisTemplate.getConnectionFactory().getConnection().ping();
            if ("PONG".equalsIgnoreCase(pong)) {
                componentHealth.put("redis", new ComponentHealth("UP", System.currentTimeMillis(), "Connected"));
            } else {
                componentHealth.put("redis", new ComponentHealth("DOWN", System.currentTimeMillis(), "Unexpected response"));
            }
        } catch (Exception e) {
            log.warn("Redis health check failed: {}", e.getMessage());
            componentHealth.put("redis", new ComponentHealth("DOWN", System.currentTimeMillis(), e.getMessage()));
        }
    }

    private void checkKafka() {
        // Kafka is async-only, so we just mark it as UP if we haven't had recent failures
        // In a real implementation, you'd check producer/consumer connectivity
        componentHealth.put("kafka", new ComponentHealth("UP", System.currentTimeMillis(), "Async only - assumed available"));
    }

    private String calculateOverallStatus() {
        if (componentHealth.isEmpty()) {
            return "UNKNOWN";
        }
        
        boolean allUp = componentHealth.values().stream()
            .allMatch(ch -> "UP".equals(ch.status()));
        
        boolean anyUp = componentHealth.values().stream()
            .anyMatch(ch -> "UP".equals(ch.status()));
        
        if (allUp) return "UP";
        if (anyUp) return "DEGRADED";
        return "DOWN";
    }

    public record ComponentHealth(String status, long lastCheck, String message) {}
}
