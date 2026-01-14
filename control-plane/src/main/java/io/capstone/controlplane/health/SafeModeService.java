package io.capstone.controlplane.health;

import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Safe Mode Service - handles degradation logic.
 * When infrastructure is failing, the system enters safe mode
 * to prevent cascading failures.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SafeModeService {

    private final AtomicBoolean safeModeActive = new AtomicBoolean(false);
    private final AtomicReference<String> safeModeReason = new AtomicReference<>("");
    private final AtomicReference<Instant> safeModeTriggeredAt = new AtomicReference<>();
    
    private final WebSocketPublisher webSocketPublisher;
    private final HealthAggregatorService healthAggregatorService;
    
    @PostConstruct
    public void init() {
        // Break circular dependency by setting reference after construction
        healthAggregatorService.setSafeModeService(this);
    }

    /**
     * Check if safe mode is currently active
     */
    public boolean isSafeModeActive() {
        return safeModeActive.get();
    }

    /**
     * Get safe mode status details
     */
    public Map<String, Object> getStatus() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("active", safeModeActive.get());
        status.put("reason", safeModeReason.get());
        
        Instant triggeredAt = safeModeTriggeredAt.get();
        if (triggeredAt != null) {
            status.put("triggeredAt", triggeredAt.toString());
            status.put("duration", java.time.Duration.between(triggeredAt, Instant.now()).toSeconds());
        }
        
        return status;
    }

    /**
     * Trigger safe mode
     */
    public void triggerSafeMode(String reason) {
        if (safeModeActive.compareAndSet(false, true)) {
            safeModeReason.set(reason);
            safeModeTriggeredAt.set(Instant.now());
            
            log.warn("SAFE MODE ACTIVATED: {}", reason);
            
            // Notify all connected clients
            webSocketPublisher.publishSafeModeChange(getStatus());
        }
    }

    /**
     * Resolve safe mode
     */
    public void resolveSafeMode() {
        if (safeModeActive.compareAndSet(true, false)) {
            log.info("SAFE MODE RESOLVED after {} seconds", 
                java.time.Duration.between(safeModeTriggeredAt.get(), Instant.now()).toSeconds());
            
            safeModeReason.set("");
            safeModeTriggeredAt.set(null);
            
            // Notify all connected clients
            webSocketPublisher.publishSafeModeChange(getStatus());
        }
    }

    /**
     * Auto-trigger safe mode based on health status.
     * Called by HealthAggregatorService with the current status to avoid circular dependency.
     * 
     * @param healthStatus Current overall health status (UP, DOWN, DEGRADED)
     */
    public void evaluateAndTrigger(String healthStatus) {
        if ("DOWN".equals(healthStatus) && !safeModeActive.get()) {
            triggerSafeMode("Automatic trigger: All infrastructure components are DOWN");
        } else if ("UP".equals(healthStatus) && safeModeActive.get()) {
            resolveSafeMode();
        }
        // DEGRADED does not auto-trigger or auto-resolve - manual intervention preferred
    }
}
