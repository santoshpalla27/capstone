package io.capstone.controlplane.api;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.lang.management.ManagementFactory;
import java.util.Map;

/**
 * Main API controller for the Control Plane.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class ApiController {

    @GetMapping
    public ResponseEntity<Map<String, Object>> getInfo() {
        return ResponseEntity.ok(Map.of(
            "name", "Control Plane",
            "version", "1.0.0",
            "stage", "Stage 1",
            "description", "Platform Brain - Health Aggregation, Safe-Mode, WebSocket Updates"
        ));
    }

    @GetMapping("/status")
    public ResponseEntity<Map<String, Object>> getStatus() {
        return ResponseEntity.ok(Map.of(
            "status", "running",
            "uptime", ManagementFactory.getRuntimeMXBean().getUptime(),
            "timestamp", System.currentTimeMillis()
        ));
    }
}
