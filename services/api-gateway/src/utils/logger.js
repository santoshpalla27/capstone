const winston = require('winston');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: { service: 'api-gateway' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ level, message, timestamp }) =>
                    `${timestamp} [${level}]: ${typeof message === 'object' ? JSON.stringify(message) : message}`
                )
            )
        })
    ]
});

module.exports = logger;
