package io.capstone.controlplane.controller;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.time.Duration;
import java.util.Map;

/**
 * Controller that proxies requests to the microservices API gateway.
 * Frontend -> Backend -> Gateway -> Microservice
 */
@RestController
@RequestMapping("/api/microservices")
@Slf4j
public class MicroservicesController {

    private final RestTemplate restTemplate;
    
    @Value("${microservices.gateway.url:http://api-gateway:8000}")
    private String gatewayUrl;

    public MicroservicesController() {
        this.restTemplate = new RestTemplate();
        // Set reasonable timeouts
        this.restTemplate.setRequestFactory(new org.springframework.http.client.SimpleClientHttpRequestFactory() {{
            setConnectTimeout((int) Duration.ofSeconds(5).toMillis());
            setReadTimeout((int) Duration.ofSeconds(10).toMillis());
        }});
    }

    /**
     * Get health status of a specific microservice
     */
    @GetMapping("/{serviceId}/health")
    public ResponseEntity<Object> getServiceHealth(@PathVariable String serviceId) {
        String url = gatewayUrl + "/api/" + serviceId + "/health";
        log.debug("Proxying health check to: {}", url);
        
        try {
            ResponseEntity<Object> response = restTemplate.getForEntity(url, Object.class);
            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (Exception e) {
            log.warn("Service {} health check failed: {}", serviceId, e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                "status", "DOWN",
                "service", serviceId,
                "error", e.getMessage()
            ));
        }
    }

    /**
     * Check MongoDB connectivity for a microservice
     */
    @GetMapping("/{serviceId}/check-mongodb")
    public ResponseEntity<Object> checkMongoDB(@PathVariable String serviceId) {
        String url = gatewayUrl + "/api/" + serviceId + "/api/v1/check-mongo";
        log.debug("Proxying MongoDB check to: {}", url);
        
        try {
            ResponseEntity<Object> response = restTemplate.getForEntity(url, Object.class);
            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (Exception e) {
            log.warn("Service {} MongoDB check failed: {}", serviceId, e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                "status", "DOWN",
                "canConnect", false,
                "error", e.getMessage()
            ));
        }
    }

    /**
     * Check Kafka connectivity for a microservice
     */
    @GetMapping("/{serviceId}/check-kafka")
    public ResponseEntity<Object> checkKafka(@PathVariable String serviceId) {
        String url = gatewayUrl + "/api/" + serviceId + "/api/v1/check-kafka";
        log.debug("Proxying Kafka check to: {}", url);
        
        try {
            ResponseEntity<Object> response = restTemplate.getForEntity(url, Object.class);
            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (Exception e) {
            log.warn("Service {} Kafka check failed: {}", serviceId, e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                "status", "DOWN",
                "canConnect", false,
                "error", e.getMessage()
            ));
        }
    }

    /**
     * Check peer service connectivity for a microservice
     */
    @GetMapping("/{serviceId}/check-services")
    public ResponseEntity<Object> checkServices(@PathVariable String serviceId) {
        String url = gatewayUrl + "/api/" + serviceId + "/api/v1/check-services";
        log.debug("Proxying services check to: {}", url);
        
        try {
            ResponseEntity<Object> response = restTemplate.getForEntity(url, Object.class);
            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (Exception e) {
            log.warn("Service {} peer check failed: {}", serviceId, e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                "service", serviceId,
                "error", e.getMessage()
            ));
        }
    }

    /**
     * Get info about a specific microservice
     */
    @GetMapping("/{serviceId}/info")
    public ResponseEntity<Object> getServiceInfo(@PathVariable String serviceId) {
        String url = gatewayUrl + "/api/" + serviceId + "/api/v1/info";
        log.debug("Proxying info request to: {}", url);
        
        try {
            ResponseEntity<Object> response = restTemplate.getForEntity(url, Object.class);
            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (Exception e) {
            log.warn("Service {} info request failed: {}", serviceId, e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                "service", serviceId,
                "error", e.getMessage()
            ));
        }
    }

    /**
     * Get gateway status and all registered services
     */
    @GetMapping("/gateway/status")
    public ResponseEntity<Object> getGatewayStatus() {
        String url = gatewayUrl + "/gateway/services";
        log.debug("Fetching gateway status from: {}", url);
        
        try {
            ResponseEntity<Object> response = restTemplate.getForEntity(url, Object.class);
            return ResponseEntity.status(response.getStatusCode()).body(response.getBody());
        } catch (Exception e) {
            log.warn("Gateway status check failed: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                "status", "DOWN",
                "gateway", gatewayUrl,
                "error", e.getMessage()
            ));
        }
    }
}
