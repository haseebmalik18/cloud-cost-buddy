const express = require('express');
const CloudServiceFactory = require('../services/CloudServiceFactory');
const CostNormalizer = require('../utils/costNormalizer');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');
const { 
  validateTrendsQuery, 
  validateComparisonQuery, 
  validateCostQuery,
  sanitizeInput 
} = require('../middleware/validators');

const router = express.Router();

/**
 * GET /api/dashboard/summary
 * Get multi-cloud dashboard summary with data from all providers
 */
router.get('/summary', authenticateToken, sanitizeInput, validateCostQuery, async (req, res, next) => {
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

    // Get user's cloud services
    const userServices = await CloudServiceFactory.getAllUserServices(req.userId);
    
    // Fetch data from all user's cloud accounts in parallel
    const cloudResults = [];
    
    // Process AWS accounts
    if (userServices.aws) {
      for (const awsInstance of userServices.aws) {
        cloudResults.push(
          awsInstance.service.getCurrentMonthCosts()
            .then(data => ({ 
              provider: 'aws', 
              accountId: awsInstance.account.account_id,
              accountName: awsInstance.account.account_name,
              data 
            }))
            .catch(error => ({ 
              provider: 'aws', 
              accountId: awsInstance.account.account_id,
              error: error.message 
            }))
        );
      }
    }
    
    // Process Azure accounts  
    if (userServices.azure) {
      for (const azureInstance of userServices.azure) {
        cloudResults.push(
          azureInstance.service.getCurrentMonthCosts()
            .then(data => ({ 
              provider: 'azure', 
              accountId: azureInstance.account.account_id,
              accountName: azureInstance.account.account_name,
              data 
            }))
            .catch(error => ({ 
              provider: 'azure', 
              accountId: azureInstance.account.account_id,
              error: error.message 
            }))
        );
      }
    }
    
    // Process GCP accounts
    if (userServices.gcp) {
      for (const gcpInstance of userServices.gcp) {
        cloudResults.push(
          gcpInstance.service.getCurrentMonthCosts()
            .then(data => ({ 
              provider: 'gcp', 
              accountId: gcpInstance.account.account_id,
              accountName: gcpInstance.account.account_name,
              data 
            }))
            .catch(error => ({ 
              provider: 'gcp', 
              accountId: gcpInstance.account.account_id,
              error: error.message 
            }))
        );
      }
    }
    
    const results = await Promise.allSettled(cloudResults);

    const normalizedData = [];
    const providerSummary = { aws: [], azure: [], gcp: [] };

    // Process results and update summary
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.data) {
        const { provider, accountId, accountName, data } = result.value;
        
        // Normalize the data
        const normalized = CostNormalizer.normalizeCostData(data, provider);
        normalized.accountId = accountId;
        normalized.accountName = accountName;
        normalizedData.push(normalized);

        // Group by provider
        if (!providerSummary[provider]) {
          providerSummary[provider] = [];
        }
        providerSummary[provider].push({
          accountId,
          accountName,
          totalCost: normalized.totalCost,
          currency: normalized.currency,
          topServices: normalized.services.slice(0, 3),
          lastUpdated: new Date().toISOString()
        });

        // Add to total cost
        summary.totalCost += normalized.totalCost;

      } else if (result.status === 'fulfilled' && result.value.error) {
        const { provider, accountId, error } = result.value;
        logger.warn(`Failed to fetch ${provider} data for account ${accountId}:`, error);
        
        if (!providerSummary[provider]) {
          providerSummary[provider] = [];
        }
        providerSummary[provider].push({
          accountId,
          status: 'error',
          error,
          lastUpdated: new Date().toISOString()
        });
      }
    });

    // Create provider summaries
    Object.keys(providerSummary).forEach(provider => {
      const accounts = providerSummary[provider];
      if (accounts.length > 0) {
        const successfulAccounts = accounts.filter(acc => !acc.error);
        const totalProviderCost = successfulAccounts.reduce((sum, acc) => sum + (acc.totalCost || 0), 0);
        
        summary.clouds[provider] = {
          available: true,
          status: successfulAccounts.length > 0 ? 'active' : 'error',
          accountCount: accounts.length,
          totalCost: totalProviderCost,
          currency: 'USD',
          accounts: accounts,
          topServices: successfulAccounts.length > 0 
            ? successfulAccounts[0].topServices || []
            : [],
          lastUpdated: new Date().toISOString()
        };
      } else {
        summary.clouds[provider] = {
          available: false,
          status: 'no_accounts',
          message: 'No accounts connected',
          lastUpdated: new Date().toISOString()
        };
      }
    });

    // Combine normalized data for cross-cloud service comparison
    if (normalizedData.length > 0) {
      const combined = CostNormalizer.combineMultiCloudData(normalizedData);
      summary.combinedServices = combined.combinedServices.slice(0, 10); // Top 10 services across all clouds
    }

    logger.info(`Multi-cloud dashboard summary retrieved for user ${req.userId}: $${summary.totalCost} USD`);

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
router.get('/compare', authenticateToken, sanitizeInput, validateComparisonQuery, async (req, res, next) => {
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
router.get('/health', authenticateToken, async (req, res, next) => {
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
    message: 'Alert system not yet implemented',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/dashboard/trends
 * Get cost trends across all cloud providers
 */
router.get('/trends', authenticateToken, sanitizeInput, validateTrendsQuery, async (req, res, next) => {
  try {
    const { 
      startDate, 
      endDate, 
      granularity = 'Daily',
      provider = 'all'
    } = req.query;

    // Validation is now handled by middleware

    const trends = {
      period: { startDate, endDate },
      granularity,
      providers: {},
      combined: {
        trends: [],
        totalCost: 0,
        currency: 'USD'
      }
    };

    const providers = provider === 'all' ? ['aws', 'azure', 'gcp'] : [provider];
    const trendParams = { startDate, endDate, granularity };

    // Fetch trends from requested providers
    const trendResults = await Promise.allSettled([
      providers.includes('aws') ? awsService.getCostTrends(startDate, endDate, granularity) : null,
      providers.includes('azure') ? azureService.getCostTrends(startDate, endDate, granularity) : null,
      providers.includes('gcp') ? gcpService.getCostTrends(startDate, endDate, granularity) : null
    ]);

    // Process AWS trends
    if (trendResults[0] && trendResults[0].status === 'fulfilled' && trendResults[0].value) {
      const awsTrends = trendResults[0].value;
      trends.providers.aws = {
        available: true,
        trends: awsTrends.trends || [],
        totalCost: awsTrends.totalCost || 0,
        currency: awsTrends.currency || 'USD'
      };
    } else {
      trends.providers.aws = { available: false, error: 'Failed to fetch AWS trends' };
    }

    // Process Azure trends
    if (trendResults[1] && trendResults[1].status === 'fulfilled' && trendResults[1].value) {
      const azureTrends = trendResults[1].value;
      trends.providers.azure = {
        available: true,
        trends: azureTrends.trends || [],
        totalCost: azureTrends.totalCost || 0,
        currency: azureTrends.currency || 'USD'
      };
    } else {
      trends.providers.azure = { available: false, error: 'Failed to fetch Azure trends' };
    }

    // Process GCP trends
    if (trendResults[2] && trendResults[2].status === 'fulfilled' && trendResults[2].value) {
      const gcpTrends = trendResults[2].value;
      trends.providers.gcp = {
        available: true,
        trends: gcpTrends.trends || [],
        totalCost: gcpTrends.totalCost || 0,
        currency: gcpTrends.currency || 'USD'
      };
    } else {
      trends.providers.gcp = { available: false, error: 'Failed to fetch GCP trends' };
    }

    // Combine trends from all providers
    const combinedTrendsMap = new Map();
    let totalCost = 0;

    Object.values(trends.providers).forEach(providerTrends => {
      if (providerTrends.available && providerTrends.trends) {
        totalCost += providerTrends.totalCost;
        
        providerTrends.trends.forEach(trend => {
          const dateKey = trend.date;
          if (combinedTrendsMap.has(dateKey)) {
            combinedTrendsMap.get(dateKey).cost += trend.cost;
          } else {
            combinedTrendsMap.set(dateKey, {
              date: dateKey,
              cost: trend.cost,
              currency: 'USD'
            });
          }
        });
      }
    });

    trends.combined = {
      trends: Array.from(combinedTrendsMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date)),
      totalCost,
      currency: 'USD'
    };

    logger.info(`Multi-cloud trends retrieved for ${startDate} to ${endDate}: $${totalCost} USD`);

    res.status(200).json({
      success: true,
      data: trends,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

module.exports = router;