const logger = require('./logger');

/**
 * Monitoring and metrics utilities
 */
class MonitoringService {
  constructor() {
    this.metrics = {
      requests: {
        total: 0,
        byStatus: {},
        byEndpoint: {},
        byProvider: {}
      },
      cloudServices: {
        aws: { requests: 0, errors: 0, avgResponseTime: 0 },
        azure: { requests: 0, errors: 0, avgResponseTime: 0 },
        gcp: { requests: 0, errors: 0, avgResponseTime: 0 }
      },
      performance: {
        responseTimeHistory: [],
        memoryUsage: [],
        cpuUsage: []
      }
    };

    // Start collecting system metrics
    this.startSystemMetrics();
  }

  /**
   * Record an API request
   */
  recordRequest(req, res, responseTime) {
    this.metrics.requests.total++;
    
    const status = res.statusCode;
    this.metrics.requests.byStatus[status] = (this.metrics.requests.byStatus[status] || 0) + 1;
    
    const endpoint = this.normalizeEndpoint(req.originalUrl);
    this.metrics.requests.byEndpoint[endpoint] = (this.metrics.requests.byEndpoint[endpoint] || 0) + 1;
    
    // Store response time for performance analysis
    this.metrics.performance.responseTimeHistory.push({
      timestamp: Date.now(),
      responseTime,
      endpoint,
      status
    });
    
    // Keep only last 1000 response times
    if (this.metrics.performance.responseTimeHistory.length > 1000) {
      this.metrics.performance.responseTimeHistory.shift();
    }

    // Log slow requests
    if (responseTime > 5000) { // 5 seconds
      logger.warn('Slow API request detected', {
        endpoint,
        responseTime: `${responseTime}ms`,
        status,
        requestId: req.id
      });
    }
  }

  /**
   * Record cloud service request
   */
  recordCloudServiceRequest(provider, success, responseTime) {
    const providerLower = provider.toLowerCase();
    if (!this.metrics.cloudServices[providerLower]) {
      this.metrics.cloudServices[providerLower] = { requests: 0, errors: 0, avgResponseTime: 0 };
    }

    const service = this.metrics.cloudServices[providerLower];
    service.requests++;
    
    if (!success) {
      service.errors++;
    }

    // Update average response time
    service.avgResponseTime = (service.avgResponseTime + responseTime) / 2;

    this.metrics.requests.byProvider[providerLower] = (this.metrics.requests.byProvider[providerLower] || 0) + 1;
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const now = Date.now();
    const last5Minutes = now - (5 * 60 * 1000);
    
    // Calculate recent metrics
    const recentResponseTimes = this.metrics.performance.responseTimeHistory
      .filter(entry => entry.timestamp > last5Minutes);
    
    const avgResponseTime = recentResponseTimes.length > 0 
      ? recentResponseTimes.reduce((sum, entry) => sum + entry.responseTime, 0) / recentResponseTimes.length
      : 0;

    const errorRate = this.metrics.requests.total > 0 
      ? ((this.metrics.requests.byStatus['500'] || 0) / this.metrics.requests.total) * 100
      : 0;

    return {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      requests: {
        ...this.metrics.requests,
        recent: {
          count: recentResponseTimes.length,
          avgResponseTime: Math.round(avgResponseTime),
          errorRate: Math.round(errorRate * 100) / 100
        }
      },
      cloudServices: this.metrics.cloudServices,
      system: this.getSystemMetrics(),
      health: this.getHealthStatus()
    };
  }

  /**
   * Get system metrics
   */
  getSystemMetrics() {
    const memUsage = process.memoryUsage();
    
    return {
      memory: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memUsage.external / 1024 / 1024), // MB
        rss: Math.round(memUsage.rss / 1024 / 1024) // MB
      },
      uptime: Math.round(process.uptime()),
      nodeVersion: process.version,
      platform: process.platform,
      pid: process.pid
    };
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const metrics = this.metrics;
    const errorRate = metrics.requests.total > 0 
      ? ((metrics.requests.byStatus['500'] || 0) / metrics.requests.total) * 100
      : 0;

    const avgResponseTime = this.calculateAverageResponseTime(5); // Last 5 minutes

    let status = 'healthy';
    const issues = [];

    // Check error rate
    if (errorRate > 5) {
      status = 'degraded';
      issues.push(`High error rate: ${errorRate.toFixed(2)}%`);
    }

    // Check response time
    if (avgResponseTime > 3000) {
      status = status === 'healthy' ? 'degraded' : 'critical';
      issues.push(`High response time: ${avgResponseTime}ms`);
    }

    // Check memory usage
    const memUsage = process.memoryUsage();
    const memUsedMB = memUsage.heapUsed / 1024 / 1024;
    if (memUsedMB > 512) { // 512MB threshold
      status = status === 'healthy' ? 'degraded' : 'critical';
      issues.push(`High memory usage: ${Math.round(memUsedMB)}MB`);
    }

    return {
      status,
      issues,
      lastCheck: new Date().toISOString()
    };
  }

  /**
   * Calculate average response time for the last N minutes
   */
  calculateAverageResponseTime(minutes = 5) {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    const recentTimes = this.metrics.performance.responseTimeHistory
      .filter(entry => entry.timestamp > cutoff)
      .map(entry => entry.responseTime);

    return recentTimes.length > 0 
      ? recentTimes.reduce((sum, time) => sum + time, 0) / recentTimes.length
      : 0;
  }

  /**
   * Normalize endpoint for metrics
   */
  normalizeEndpoint(url) {
    // Remove query parameters and normalize dynamic segments
    return url
      .split('?')[0]
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[a-f\d-]{36}/g, '/:uuid'); // UUIDs
  }

  /**
   * Start collecting system metrics periodically
   */
  startSystemMetrics() {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      
      this.metrics.performance.memoryUsage.push({
        timestamp: Date.now(),
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      });

      // Keep only last 100 memory samples
      if (this.metrics.performance.memoryUsage.length > 100) {
        this.metrics.performance.memoryUsage.shift();
      }

      // Log health status periodically
      const health = this.getHealthStatus();
      if (health.status !== 'healthy') {
        logger.warn('Health check alert', {
          status: health.status,
          issues: health.issues
        });
      }

    }, 60000); // Every minute
  }

  /**
   * Reset metrics (useful for testing)
   */
  reset() {
    this.metrics = {
      requests: {
        total: 0,
        byStatus: {},
        byEndpoint: {},
        byProvider: {}
      },
      cloudServices: {
        aws: { requests: 0, errors: 0, avgResponseTime: 0 },
        azure: { requests: 0, errors: 0, avgResponseTime: 0 },
        gcp: { requests: 0, errors: 0, avgResponseTime: 0 }
      },
      performance: {
        responseTimeHistory: [],
        memoryUsage: [],
        cpuUsage: []
      }
    };
  }
}

// Create singleton instance
const monitoringService = new MonitoringService();

/**
 * Express middleware to record request metrics
 */
const recordMetrics = (req, res, next) => {
  const startTime = Date.now();
  
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    monitoringService.recordRequest(req, res, responseTime);
  });
  
  next();
};

module.exports = {
  monitoringService,
  recordMetrics
};