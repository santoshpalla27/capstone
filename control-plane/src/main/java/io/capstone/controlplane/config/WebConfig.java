package io.capstone.controlplane.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * CORS configuration for frontend access.
 * 
 * SECURITY NOTE: This permissive configuration is for LOCAL DEVELOPMENT ONLY.
 * TODO: Lock down in Stage 2 with explicit allowed origins:
 *   - Production: Only allow specific frontend domains
 *   - Use environment-based configuration
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        // WARNING: Dev-only - must be locked down in production (Stage 2+)
        registry.addMapping("/**")
                .allowedOriginPatterns("*")
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }
}
