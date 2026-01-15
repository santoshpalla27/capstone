// MongoDB initialization script for microservices
// Used by: go-service, python-service

db = db.getSiblingDB('admin');

// Create databases for services that use MongoDB
const services = [
    { db: 'go_service_db', collections: ['data', 'events'] },
    { db: 'python_service_db', collections: ['data', 'analytics'] }
];

services.forEach(service => {
    print(`Setting up database: ${service.db}`);

    db = db.getSiblingDB(service.db);

    // Create collections
    service.collections.forEach(collection => {
        if (!db.getCollectionNames().includes(collection)) {
            db.createCollection(collection);
            print(`  Created collection: ${collection}`);
        }
    });

    // Create indexes
    if (service.db === 'go_service_db') {
        db.data.createIndex({ "createdAt": -1 });
        db.events.createIndex({ "timestamp": -1 }, { expireAfterSeconds: 604800 });
    }

    if (service.db === 'python_service_db') {
        db.data.createIndex({ "createdAt": -1 });
        db.analytics.createIndex({ "timestamp": -1 }, { expireAfterSeconds: 2592000 });
    }
});

print('MongoDB initialization complete!');
print('Databases: go_service_db, python_service_db');
