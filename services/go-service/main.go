package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"go.mongodb.org/mongo-driver/mongo/readpref"
)

var (
	mongoClient *mongo.Client
	mongoReady  bool
	startTime   = time.Now()

	// Prometheus metrics
	requestCounter = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "go_service_requests_total",
			Help: "Total requests by endpoint and status",
		},
		[]string{"endpoint", "status"},
	)
	mongoLatency = prometheus.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "go_service_mongo_latency_seconds",
			Help:    "MongoDB operation latency",
			Buckets: []float64{0.01, 0.05, 0.1, 0.5, 1, 2, 5},
		},
	)
)

func init() {
	prometheus.MustRegister(requestCounter)
	prometheus.MustRegister(mongoLatency)
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "3001"
	}

	// Connect to MongoDB with retry
	go connectMongo()

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(metricsMiddleware())

	// Health endpoints
	r.GET("/health", healthHandler)
	r.GET("/ready", readyHandler)

	// API endpoints
	api := r.Group("/api/v1")
	{
		api.GET("/check-mongo", checkMongoHandler)
		api.GET("/check-services", checkServicesHandler)
		api.GET("/info", infoHandler)
		api.POST("/data", createDataHandler)
		api.GET("/data", getDataHandler)
	}

	// Prometheus metrics
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	srv := &http.Server{
		Addr:    ":" + port,
		Handler: r,
	}

	// Graceful shutdown
	go func() {
		log.Printf("Go Service starting on port %s", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if mongoClient != nil {
		mongoClient.Disconnect(ctx)
	}
	srv.Shutdown(ctx)
}

func connectMongo() {
	mongoURI := os.Getenv("MONGO_URI")
	if mongoURI == "" {
		mongoURI = "mongodb://admin:mongopass@localhost:27017/go_service_db?authSource=admin"
	}

	// Retry connection with exponential backoff
	maxRetries := 10
	for i := 0; i < maxRetries; i++ {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)

		clientOpts := options.Client().
			ApplyURI(mongoURI).
			SetServerSelectionTimeout(5 * time.Second).
			SetConnectTimeout(10 * time.Second).
			SetRetryWrites(true).
			SetRetryReads(true)

		client, err := mongo.Connect(ctx, clientOpts)
		if err != nil {
			cancel()
			log.Printf("MongoDB connect attempt %d failed: %v", i+1, err)
			time.Sleep(time.Duration(1<<i) * time.Second) // Exponential backoff
			continue
		}

		// Ping to verify connection
		if err := client.Ping(ctx, readpref.Primary()); err != nil {
			cancel()
			log.Printf("MongoDB ping attempt %d failed: %v", i+1, err)
			time.Sleep(time.Duration(1<<i) * time.Second)
			continue
		}

		mongoClient = client
		mongoReady = true
		cancel()
		log.Println("MongoDB connected successfully")
		return
	}

	log.Println("MongoDB connection failed after retries - service will run in degraded mode")
}

func metricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
		status := "success"
		if c.Writer.Status() >= 400 {
			status = "error"
		}
		requestCounter.WithLabelValues(c.FullPath(), status).Inc()
	}
}

func healthHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "UP",
		"service":   "go-service",
		"timestamp": time.Now().Format(time.RFC3339),
		"uptime":    time.Since(startTime).String(),
	})
}

func readyHandler(c *gin.Context) {
	status := "UP"
	httpStatus := http.StatusOK
	
	if !mongoReady {
		status = "DEGRADED"
	}

	c.JSON(httpStatus, gin.H{
		"status":     status,
		"service":    "go-service",
		"mongo":      mongoReady,
		"timestamp":  time.Now().Format(time.RFC3339),
	})
}

func checkMongoHandler(c *gin.Context) {
	if mongoClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":  "DOWN",
			"error":   "MongoDB client not initialized",
			"canConnect": false,
		})
		return
	}

	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	err := mongoClient.Ping(ctx, readpref.Primary())
	latency := time.Since(start)
	mongoLatency.Observe(latency.Seconds())

	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"status":     "DOWN",
			"error":      err.Error(),
			"canConnect": false,
			"latency":    latency.String(),
		})
		return
	}

	// Get server info
	var result bson.M
	mongoClient.Database("admin").RunCommand(ctx, bson.D{{Key: "serverStatus", Value: 1}}).Decode(&result)

	c.JSON(http.StatusOK, gin.H{
		"status":     "UP",
		"canConnect": true,
		"latency":    latency.String(),
		"topology":   getTopology(result),
	})
}

func getTopology(serverStatus bson.M) string {
	if repl, ok := serverStatus["repl"].(bson.M); ok {
		if _, ok := repl["setName"]; ok {
			return "replica_set"
		}
	}
	return "standalone"
}

func checkServicesHandler(c *gin.Context) {
	services := map[string]string{
		"java":   os.Getenv("JAVA_SERVICE_URL"),
		"python": os.Getenv("PYTHON_SERVICE_URL"),
		"node":   os.Getenv("NODE_SERVICE_URL"),
	}

	// Set defaults
	if services["java"] == "" {
		services["java"] = "http://java-service:3002"
	}
	if services["python"] == "" {
		services["python"] = "http://python-service:3003"
	}
	if services["node"] == "" {
		services["node"] = "http://node-service:3004"
	}

	results := make(map[string]gin.H)

	for name, url := range services {
		start := time.Now()
		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Get(url + "/health")
		latency := time.Since(start)

		if err != nil {
			results[name] = gin.H{"status": "DOWN", "error": err.Error(), "latency": latency.String()}
			continue
		}
		resp.Body.Close()

		status := "UP"
		if resp.StatusCode >= 400 {
			status = "DOWN"
		}
		results[name] = gin.H{"status": status, "latency": latency.String()}
	}

	c.JSON(http.StatusOK, gin.H{
		"service":  "go-service",
		"services": results,
	})
}

func infoHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"service":   "go-service",
		"version":   "1.0.0",
		"language":  "Go",
		"framework": "Gin",
		"features":  []string{"mongodb", "health-checks", "metrics", "retry"},
		"uptime":    time.Since(startTime).String(),
	})
}

func createDataHandler(c *gin.Context) {
	if mongoClient == nil || !mongoReady {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MongoDB not available"})
		return
	}

	var data map[string]interface{}
	if err := c.ShouldBindJSON(&data); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	data["createdAt"] = time.Now()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	result, err := mongoClient.Database("go_service_db").Collection("data").InsertOne(ctx, data)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"id": result.InsertedID, "status": "created"})
}

func getDataHandler(c *gin.Context) {
	if mongoClient == nil || !mongoReady {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "MongoDB not available"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cursor, err := mongoClient.Database("go_service_db").Collection("data").Find(ctx, bson.M{})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": results, "count": len(results)})
}
