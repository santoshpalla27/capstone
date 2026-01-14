package io.capstone.controlplane.health;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Health endpoints for the Control Plane.
 * Supports /health, /health/liveness, /health/readiness
 */
@RestController
@RequestMapping("/health")
@RequiredArgsConstructor
public class HealthController {

    private final HealthAggregatorService healthAggregator;
    private final SafeModeService safeModeService;

    /**
     * Main health endpoint - aggregates all component health
     */
    @GetMapping
    public ResponseEntity<Map<String, Object>> getHealth() {
        return ResponseEntity.ok(healthAggregator.getAggregatedHealth());
    }

    /**
     * Liveness probe - is the application running?
     * Always returns OK unless the app is completely broken
     */
    @GetMapping("/liveness")
    public ResponseEntity<Map<String, Object>> getLiveness() {
        return ResponseEntity.ok(Map.of(
            "status", "UP",
            "timestamp", System.currentTimeMillis()
        ));
    }

    /**
     * Readiness probe - is the application ready to receive traffic?
     * Checks if critical dependencies are available
     */
    @GetMapping("/readiness")
    public ResponseEntity<Map<String, Object>> getReadiness() {
        boolean isReady = healthAggregator.isReady();
        Map<String, Object> response = Map.of(
            "status", isReady ? "UP" : "DOWN",
            "safeMode", safeModeService.isSafeModeActive(),
            "timestamp", System.currentTimeMillis()
        );
        
        if (isReady) {
            return ResponseEntity.ok(response);
        } else {
            return ResponseEntity.status(503).body(response);
        }
    }

    /**
     * Safe mode status and control
     */
    @GetMapping("/safe-mode")
    public ResponseEntity<Map<String, Object>> getSafeModeStatus() {
        return ResponseEntity.ok(safeModeService.getStatus());
    }

    @PostMapping("/safe-mode/trigger")
    public ResponseEntity<Map<String, Object>> triggerSafeMode(@RequestBody Map<String, String> request) {
        String reason = request.getOrDefault("reason", "Manual trigger");
        safeModeService.triggerSafeMode(reason);
        return ResponseEntity.ok(safeModeService.getStatus());
    }

    @PostMapping("/safe-mode/resolve")
    public ResponseEntity<Map<String, Object>> resolveSafeMode() {
        safeModeService.resolveSafeMode();
        return ResponseEntity.ok(safeModeService.getStatus());
    }
}
