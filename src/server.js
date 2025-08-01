const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
require('dotenv').config();

const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const requestId = require('./middleware/requestId');
const { sanitizeInput } = require('./middleware/validators');
const { recordMetrics, monitoringService } = require('./utils/monitoring');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const awsRoutes = require('./routes/aws');
const azureRoutes = require('./routes/azure');
const gcpRoutes = require('./routes/gcp');
const dashboardRoutes = require('./routes/dashboard');
const alertRoutes = require('./routes/alerts');
const { initializeDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy configuration
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Enhanced security middleware
app.use(helmet({
  contentSecurityPolicy: process.env.ENABLE_CSP === 'true' ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  } : false,
  hsts: process.env.ENABLE_HSTS === 'true' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false,
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "same-origin" }
}));

// CORS configuration for mobile app
app.use(cors({
  origin: ['https://cloudcostbuddy.app', 'https://app.cloudcostbuddy.com'],
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

// Request ID middleware for tracing
app.use(requestId);

// Metrics recording middleware
app.use(recordMetrics);

// Request logging with request ID
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
const { sequelize } = require('./models');
const sessionStore = new SequelizeStore({
  db: sequelize,
  tableName: 'sessions',
  checkExpirationInterval: 15 * 60 * 1000, // 15 minutes
  expiration: 24 * 60 * 60 * 1000 // 24 hours
});

app.use(session({
  secret: process.env.SESSION_SECRET || (() => {
    console.warn('SESSION_SECRET not set, using generated secret. Set SESSION_SECRET in production.');
    return require('crypto').randomBytes(32).toString('hex');
  })(),
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Global input sanitization
app.use(sanitizeInput);

// Health check endpoint
app.get('/health', (req, res) => {
  const health = monitoringService.getHealthStatus();
  const statusCode = health.status === 'healthy' ? 200 : 
                    health.status === 'degraded' ? 207 : 503;
  
  res.status(statusCode).json({
    status: health.status,
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
    version: require('../package.json').version,
    issues: health.issues || []
  });
});

// Detailed health check endpoint
app.get('/health/detailed', (req, res) => {
  const metrics = monitoringService.getMetrics();
  res.status(200).json({
    ...metrics,
    endpoints: {
      health: '/health',
      metrics: '/metrics',
      api: '/api'
    }
  });
});

// Metrics endpoint for monitoring systems
app.get('/metrics', (req, res) => {
  const metrics = monitoringService.getMetrics();
  res.status(200).json(metrics);
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
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
      auth: '/api/auth',
      accounts: '/api/accounts',
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

// Initialize database and start server
const startServer = async () => {
  try {
    // Initialize database
    await initializeDatabase();
    logger.info('Database initialized successfully');

    // Start server
    app.listen(PORT, () => {
      logger.info(`CloudCost Buddy API server running on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`API Documentation: http://localhost:${PORT}/api`);
      logger.info(`Health Check: http://localhost:${PORT}/health`);
      logger.info('Multi-tenant CloudCost Buddy is ready');
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;