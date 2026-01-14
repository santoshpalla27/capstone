-- MySQL initialization for Control Plane

USE controlplane;

-- Platform configuration
CREATE TABLE IF NOT EXISTS platform_config (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    config_key VARCHAR(255) NOT NULL UNIQUE,
    config_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Service registry
CREATE TABLE IF NOT EXISTS service_registry (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    service_name VARCHAR(255) NOT NULL UNIQUE,
    status ENUM('UP', 'DOWN', 'DEGRADED', 'UNKNOWN') DEFAULT 'UNKNOWN',
    last_heartbeat TIMESTAMP NULL,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Safe mode history
CREATE TABLE IF NOT EXISTS safe_mode_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(500) NOT NULL,
    resolved_at TIMESTAMP NULL
);

-- Default config
INSERT INTO platform_config (config_key, config_value) VALUES
    ('safe_mode.enabled', 'false'),
    ('safe_mode.auto_trigger', 'true'),
    ('health.check_interval_ms', '5000')
ON DUPLICATE KEY UPDATE config_value = VALUES(config_value);
