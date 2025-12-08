import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sensitive data patterns to mask
const sensitivePatterns = [
  { pattern: /\b(api[_-]?key|apikey)[\s:=]+['"]?([^'"\s]+)['"]?/gi, replacement: 'api_key: [REDACTED]' },
  { pattern: /\b(password|passwd|pwd)[\s:=]+['"]?([^'"\s]+)['"]?/gi, replacement: 'password: [REDACTED]' },
  { pattern: /\b(secret|token|bearer)[\s:=]+['"]?([^'"\s]+)['"]?/gi, replacement: 'secret: [REDACTED]' },
  { pattern: /\b(authorization):\s*bearer\s+[\w\-\.]+/gi, replacement: 'authorization: Bearer [REDACTED]' },
  { pattern: /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, replacement: '[EMAIL_REDACTED]' },
  { pattern: /\b(\d{3}[-.]?\d{2}[-.]?\d{4})\b/g, replacement: '[SSN_REDACTED]' }, // SSN pattern
  { pattern: /\b(mongodb:\/\/[^@\s]+@)/gi, replacement: 'mongodb://[CREDENTIALS_REDACTED]@' },
  { pattern: /\b(mysql:\/\/[^@\s]+@)/gi, replacement: 'mysql://[CREDENTIALS_REDACTED]@' },
];

/**
 * Sanitize log message to remove sensitive data
 * @param {string} message - Log message
 * @returns {string} Sanitized message
 */
function sanitizeMessage(message) {
  if (typeof message !== 'string') {
    return message;
  }
  
  let sanitized = message;
  
  for (const { pattern, replacement } of sensitivePatterns) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  return sanitized;
}

// Custom format to sanitize logs
const sanitizeFormat = winston.format((info) => {
  info.message = sanitizeMessage(info.message);
  
  // Also sanitize metadata
  if (info.meta && typeof info.meta === 'object') {
    info.meta = JSON.parse(sanitizeMessage(JSON.stringify(info.meta)));
  }
  
  return info;
});

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  sanitizeFormat(), // Add sanitization
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    if (stack) {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`;
    }
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Write all logs to console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      )
    }),
    // Write all logs with level 'error' and below to error.log
    new winston.transports.File({ 
      filename: path.join(__dirname, 'logs', 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs to combined.log
    new winston.transports.File({ 
      filename: path.join(__dirname, 'logs', 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({ 
      filename: path.join(__dirname, 'logs', 'exceptions.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({ 
      filename: path.join(__dirname, 'logs', 'rejections.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ]
});

// Create a stream object for Morgan HTTP logger
logger.stream = {
  write: (message) => {
    logger.info(message.trim());
  }
};

export default logger;
