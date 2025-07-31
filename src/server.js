const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const awsRoutes = require('./routes/aws');
const azureRoutes = require('./routes/azure');
const gcpRoutes = require('./routes/gcp');
const dashboardRoutes = require('./routes/dashboard');
const alertRoutes = require('./routes/alerts');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration for mobile app
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://cloudcostbuddy.app', 'https://app.cloudcostbuddy.com'] 
    : ['http://localhost:3000', 'http://localhost:19006'], // Expo dev server
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting to prevent API abuse
const limiter = rateLimit({
  windowMs: parseInt(process.env.API_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.API_RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.API_RATE_LIMIT_WINDOW_MS) || 900000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Request logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/aws', awsRoutes);
app.use('/api/azure', azureRoutes);
app.use('/api/gcp', gcpRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/alerts', alertRoutes);

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'CloudCost Buddy API',
    version: '1.0.0',
    description: 'Multi-cloud cost monitoring API for AWS, Azure, and GCP',
    endpoints: {
      health: '/health',
      aws: '/api/aws',
      azure: '/api/azure',
      gcp: '/api/gcp',
      dashboard: '/api/dashboard',
      alerts: '/api/alerts'
    },
    documentation: 'https://github.com/cloudcostbuddy/api-docs'
  });
});

// 404 handler for unmatched routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.originalUrl} does not exist`,
    availableEndpoints: ['/health', '/api', '/api/aws', '/api/azure', '/api/gcp', '/api/dashboard', '/api/alerts']
  });
});

// Global error handling middleware
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  logger.info(`CloudCost Buddy API server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`API Documentation: http://localhost:${PORT}/api`);
  logger.info(`Health Check: http://localhost:${PORT}/health`);
});

module.exports = app;