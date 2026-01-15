FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn package -DskipTests -B

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
COPY --from=builder /app/target/*.jar app.jar
RUN chown -R appuser:appgroup /app
USER appuser
ENV SERVER_PORT=3002
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=3 \
  CMD wget -q --spider http://localhost:3002/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
