package io.capstone.controlplane.health;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * WebSocket publisher for live updates to connected clients.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketPublisher {

    private final SimpMessagingTemplate messagingTemplate;
    private final HealthAggregatorService healthAggregator;

    /**
     * Publish health updates to all connected clients every 5 seconds
     */
    @Scheduled(fixedRate = 5000)
    public void publishHealthUpdates() {
        try {
            Map<String, Object> health = healthAggregator.getAggregatedHealth();
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
