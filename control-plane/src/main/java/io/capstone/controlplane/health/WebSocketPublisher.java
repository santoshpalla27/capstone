package io.capstone.controlplane.health;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * WebSocket publisher for live updates to connected clients.
 * 
 * NOTE: This class does NOT depend on HealthAggregatorService to avoid circular dependency.
 * HealthAggregatorService calls publishHealthUpdates() with the data directly.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketPublisher {

    private final SimpMessagingTemplate messagingTemplate;

    /**
     * Publish health updates to all connected clients
     * Called by HealthAggregatorService after each health check
     */
    public void publishHealthUpdates(Map<String, Object> health) {
        try {
            messagingTemplate.convertAndSend("/topic/health", health);
            log.debug("Published health update via WebSocket");
        } catch (Exception e) {
            log.warn("Failed to publish health update: {}", e.getMessage());
        }
    }

    /**
     * Publish safe mode change notification
     */
    public void publishSafeModeChange(Map<String, Object> safeModeStatus) {
        try {
            messagingTemplate.convertAndSend("/topic/safe-mode", safeModeStatus);
            log.info("Published safe mode change: {}", safeModeStatus.get("active"));
        } catch (Exception e) {
            log.warn("Failed to publish safe mode change: {}", e.getMessage());
        }
    }

    /**
     * Publish infrastructure status change
     */
    public void publishInfraStatus(Map<String, Object> infraStatus) {
        try {
            messagingTemplate.convertAndSend("/topic/infrastructure", infraStatus);
        } catch (Exception e) {
            log.warn("Failed to publish infra status: {}", e.getMessage());
        }
    }
}
