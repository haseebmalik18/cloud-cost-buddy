const express = require('express');
const AWSService = require('../services/awsService');
const AzureService = require('../services/azureService');
const GCPService = require('../services/gcpService');
const CostNormalizer = require('../utils/costNormalizer');
const logger = require('../utils/logger');

const router = express.Router();

// Initialize cloud services
const awsService = new AWSService();
const azureService = new AzureService();
const gcpService = new GCPService();

/**
 * GET /api/dashboard/summary
 * Get multi-cloud dashboard summary with data from all providers
 */
router.get('/summary', async (req, res, next) => {
  try {
    const summary = {
      totalCost: 0,
      currency: 'USD',
      clouds: {
        aws: { available: true, status: 'loading' },
        azure: { available: true, status: 'loading' },
        gcp: { available: true, status: 'loading' }
      },
      combinedServices: [],
      lastUpdated: new Date().toISOString()
    };

    // Fetch data from all providers in parallel
    const cloudResults = await Promise.allSettled([
      // AWS
      awsService.getCurrentMonthCosts().then(data => ({ provider: 'aws', data })),
      // Azure
      azureService.getCurrentMonthCosts().then(data => ({ provider: 'azure', data })),
      // GCP
      gcpService.getCurrentMonthCosts().then(data => ({ provider: 'gcp', data }))
    ]);

    const normalizedData = [];

    // Process results and update summary
    cloudResults.forEach((result, index) => {
      const providers = ['aws', 'azure', 'gcp'];
      const provider = providers[index];

      if (result.status === 'fulfilled') {
        const { data } = result.value;
        
        // Normalize the data
        const normalized = CostNormalizer.normalizeCostData(data, provider);
        normalizedData.push(normalized);

        // Update cloud status
        summary.clouds[provider] = {
          available: true,
          status: 'active',
          totalCost: normalized.totalCost,
          currency: normalized.currency,
          topServices: normalized.services.slice(0, 3),
          lastUpdated: new Date().toISOString()
        };

        // Add to total cost
        summary.totalCost += normalized.totalCost;

      } else {
        // Handle errors gracefully
        logger.warn(`Failed to fetch ${provider} data:`, result.reason);
        summary.clouds[provider] = {
          available: true,
          status: 'error',
          error: result.reason?.message || 'Connection failed',
          lastUpdated: new Date().toISOString()
        };
      }
    });

    // Combine normalized data for cross-cloud service comparison
    if (normalizedData.length > 0) {
      const combined = CostNormalizer.combineMultiCloudData(normalizedData);
      summary.combinedServices = combined.combinedServices.slice(0, 10); // Top 10 services across all clouds
    }

    logger.info(`Multi-cloud dashboard summary retrieved: $${summary.totalCost} USD`);

    res.status(200).json({
      success: true,
      data: summary,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/compare
 * Compare costs across cloud providers
 */
router.get('/compare', async (req, res, next) => {
  try {
    const { metric = 'cost', period = 'current' } = req.query;

    // Fetch current month data from all providers
    const [awsResult, azureResult, gcpResult] = await Promise.allSettled([
      awsService.getCurrentMonthCosts(),
      azureService.getCurrentMonthCosts(),
      gcpService.getCurrentMonthCosts()
    ]);

    const comparison = {
      metric,
      period,
      providers: {
        aws: { available: false, totalCost: 0, currency: 'USD' },
        azure: { available: false, totalCost: 0, currency: 'USD' },
        gcp: { available: false, totalCost: 0, currency: 'USD' }
      },
      ranking: [],
      totalCost: 0,
      lastUpdated: new Date().toISOString()
    };

    // Process AWS
    if (awsResult.status === 'fulfilled') {
      comparison.providers.aws = {
        available: true,
        totalCost: awsResult.value.totalCost || 0,
        currency: awsResult.value.currency || 'USD',
        serviceCount: (awsResult.value.services || []).length
      };
      comparison.totalCost += comparison.providers.aws.totalCost;
    }

    // Process Azure
    if (azureResult.status === 'fulfilled') {
      comparison.providers.azure = {
        available: true,
        totalCost: azureResult.value.totalCost || 0,
        currency: azureResult.value.currency || 'USD',
        serviceCount: (azureResult.value.services || []).length
      };
      comparison.totalCost += comparison.providers.azure.totalCost;
    }

    // Process GCP
    if (gcpResult.status === 'fulfilled') {
      comparison.providers.gcp = {
        available: true,
        totalCost: gcpResult.value.totalCost || 0,
        currency: gcpResult.value.currency || 'USD',
        serviceCount: (gcpResult.value.services || []).length
      };
      comparison.totalCost += comparison.providers.gcp.totalCost;
    }

    // Create ranking
    comparison.ranking = Object.entries(comparison.providers)
      .filter(([, data]) => data.available)
      .map(([provider, data]) => ({
        provider,
        totalCost: data.totalCost,
        percentage: comparison.totalCost > 0 ? (data.totalCost / comparison.totalCost) * 100 : 0
      }))
      .sort((a, b) => b.totalCost - a.totalCost);

    res.status(200).json({
      success: true,
      data: comparison,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/health
 * Get health status for all cloud provider connections
 */
router.get('/health', async (req, res, next) => {
  try {
    // Test all provider connections in parallel
    const healthChecks = await Promise.allSettled([
      awsService.testConnection(),
      azureService.testConnection(),
      gcpService.testConnection()
    ]);

    const health = {
      overall: 'healthy',
      providers: {
        aws: healthChecks[0].status === 'fulfilled' ? healthChecks[0].value : { success: false, message: 'Connection failed' },
        azure: healthChecks[1].status === 'fulfilled' ? healthChecks[1].value : { success: false, message: 'Connection failed' },
        gcp: healthChecks[2].status === 'fulfilled' ? healthChecks[2].value : { success: false, message: 'Connection failed' }
      },
      timestamp: new Date().toISOString()
    };

    // Determine overall health
    const healthyCount = Object.values(health.providers).filter(p => p.success).length;
    if (healthyCount === 0) {
      health.overall = 'critical';
    } else if (healthyCount < 3) {
      health.overall = 'degraded';
    }

    const statusCode = health.overall === 'healthy' ? 200 : (health.overall === 'critical' ? 503 : 207);

    res.status(statusCode).json({
      success: health.overall !== 'critical',
      data: health,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/alerts
 * Get active alerts from all cloud providers
 */
router.get('/alerts', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: 'Alert system will be implemented in Week 5',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/dashboard/trends
 * Get cost trends across all cloud providers
 */
router.get('/trends', (req, res) => {
  res.status(501).json({
    success: false,
    error: 'Not Implemented',
    message: 'Trend analysis will be implemented in Week 5',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;