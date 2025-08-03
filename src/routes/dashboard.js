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

router.get('/alerts', authenticateToken, async (req, res, next) => {
  try {
    const alertService = require('../services/alertService');
    const activeAlerts = await alertService.getActiveAlerts(req.userId);
    
    res.status(200).json({
      success: true,
      data: {
        alerts: activeAlerts,
        count: activeAlerts.length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/trends/30-day
 * Get 30-day cost trends across all cloud providers with detailed analytics
 */
router.get('/trends/30-day', authenticateToken, sanitizeInput, async (req, res, next) => {
  try {
    const { provider = 'all' } = req.query;
    
    // Calculate date range for last 30 days
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const formattedStartDate = startDate.toISOString().split('T')[0];
    const formattedEndDate = endDate.toISOString().split('T')[0];

    // Get user's cloud services
    const userServices = await CloudServiceFactory.getAllUserServices(req.userId);

    const trends = {
      period: { 
        startDate: formattedStartDate, 
        endDate: formattedEndDate,
        days: 30
      },
      granularity: 'Daily',
      providers: {},
      combined: {
        trends: [],
        totalCost: 0,
        currency: 'USD',
        analytics: {
          averageDailyCost: 0,
          maxDailyCost: 0,
          minDailyCost: 0,
          costGrowthRate: 0,
          volatility: 0
        }
      },
      summary: {
        totalProviders: 0,
        activeProviders: 0,
        topProvider: null,
        costDistribution: {}
      }
    };

    const providers = provider === 'all' ? ['aws', 'azure', 'gcp'] : [provider];
    const trendResults = [];

    // Process each provider with user's accounts
    for (const providerName of providers) {
      if (userServices[providerName]) {
        const providerTrends = [];
        
        // Fetch trends for each account of this provider
        for (const serviceInstance of userServices[providerName]) {
          try {
            const accountTrends = await serviceInstance.service.getCostTrends(
              formattedStartDate, 
              formattedEndDate, 
              'Daily'
            );
            
            if (accountTrends && accountTrends.trends) {
              providerTrends.push({
                accountId: serviceInstance.account.account_id,
                accountName: serviceInstance.account.account_name,
                trends: accountTrends.trends,
                totalCost: accountTrends.totalCost || 0,
                currency: accountTrends.currency || 'USD'
              });
            }
          } catch (error) {
            logger.error(`Error fetching 30-day trends for ${providerName} account ${serviceInstance.account.account_id}:`, error);
          }
        }

        // Aggregate provider trends
        if (providerTrends.length > 0) {
          const aggregatedTrends = new Map();
          let providerTotalCost = 0;

          providerTrends.forEach(accountData => {
            providerTotalCost += accountData.totalCost;
            
            accountData.trends.forEach(trend => {
              const dateKey = trend.date;
              if (aggregatedTrends.has(dateKey)) {
                aggregatedTrends.get(dateKey).cost += trend.cost;
              } else {
                aggregatedTrends.set(dateKey, {
                  date: dateKey,
                  cost: trend.cost,
                  currency: 'USD'
                });
              }
            });
          });

          const sortedTrends = Array.from(aggregatedTrends.values())
            .sort((a, b) => new Date(a.date) - new Date(b.date));

          trends.providers[providerName] = {
            available: true,
            accounts: providerTrends,
            trends: sortedTrends,
            totalCost: providerTotalCost,
            currency: 'USD',
            analytics: calculateTrendAnalytics(sortedTrends)
          };
        } else {
          trends.providers[providerName] = { 
            available: false, 
            error: 'No accounts available or failed to fetch data' 
          };
        }
      } else {
        trends.providers[providerName] = { 
          available: false, 
          error: 'No accounts connected' 
        };
      }
    }

    // Combine trends from all providers
    const combinedTrendsMap = new Map();
    let totalCost = 0;
    let activeProviders = 0;
    const costDistribution = {};

    Object.entries(trends.providers).forEach(([providerName, providerData]) => {
      if (providerData.available && providerData.trends) {
        activeProviders++;
        totalCost += providerData.totalCost;
        costDistribution[providerName] = providerData.totalCost;
        
        providerData.trends.forEach(trend => {
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

    const combinedTrendsArray = Array.from(combinedTrendsMap.values())
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    trends.combined = {
      trends: combinedTrendsArray,
      totalCost,
      currency: 'USD',
      analytics: calculateTrendAnalytics(combinedTrendsArray)
    };

    // Calculate summary
    trends.summary = {
      totalProviders: providers.length,
      activeProviders,
      topProvider: activeProviders > 0 ? Object.entries(costDistribution)
        .sort(([,a], [,b]) => b - a)[0]?.[0] : null,
      costDistribution
    };

    logger.info(`30-day trends retrieved for user ${req.userId}: $${totalCost} USD across ${activeProviders} providers`);

    res.status(200).json({
      success: true,
      data: trends,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/dashboard/trends
 * Get cost trends across all cloud providers with flexible date range
 */
router.get('/trends', authenticateToken, sanitizeInput, validateTrendsQuery, async (req, res, next) => {
  try {
    const { 
      startDate, 
      endDate, 
      granularity = 'Daily',
      provider = 'all'
    } = req.query;

    // Get user's cloud services
    const userServices = await CloudServiceFactory.getAllUserServices(req.userId);

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

    // Process each provider with user's accounts
    for (const providerName of providers) {
      if (userServices[providerName]) {
        const providerTrends = [];
        
        // Fetch trends for each account of this provider
        for (const serviceInstance of userServices[providerName]) {
          try {
            const accountTrends = await serviceInstance.service.getCostTrends(
              startDate, 
              endDate, 
              granularity
            );
            
            if (accountTrends && accountTrends.trends) {
              providerTrends.push({
                accountId: serviceInstance.account.account_id,
                accountName: serviceInstance.account.account_name,
                trends: accountTrends.trends,
                totalCost: accountTrends.totalCost || 0,
                currency: accountTrends.currency || 'USD'
              });
            }
          } catch (error) {
            logger.error(`Error fetching trends for ${providerName} account ${serviceInstance.account.account_id}:`, error);
          }
        }

        // Aggregate provider trends
        if (providerTrends.length > 0) {
          const aggregatedTrends = new Map();
          let providerTotalCost = 0;

          providerTrends.forEach(accountData => {
            providerTotalCost += accountData.totalCost;
            
            accountData.trends.forEach(trend => {
              const dateKey = trend.date;
              if (aggregatedTrends.has(dateKey)) {
                aggregatedTrends.get(dateKey).cost += trend.cost;
              } else {
                aggregatedTrends.set(dateKey, {
                  date: dateKey,
                  cost: trend.cost,
                  currency: 'USD'
                });
              }
            });
          });

          trends.providers[providerName] = {
            available: true,
            accounts: providerTrends,
            trends: Array.from(aggregatedTrends.values()).sort((a, b) => new Date(a.date) - new Date(b.date)),
            totalCost: providerTotalCost,
            currency: 'USD'
          };
        } else {
          trends.providers[providerName] = { available: false, error: 'No accounts available or failed to fetch data' };
        }
      } else {
        trends.providers[providerName] = { available: false, error: 'No accounts connected' };
      }
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

/**
 * Helper function to calculate trend analytics
 */
function calculateTrendAnalytics(trends) {
  if (!trends || trends.length === 0) {
    return {
      averageDailyCost: 0,
      maxDailyCost: 0,
      minDailyCost: 0,
      costGrowthRate: 0,
      volatility: 0
    };
  }

  const costs = trends.map(t => t.cost);
  const totalCost = costs.reduce((sum, cost) => sum + cost, 0);
  const averageDailyCost = totalCost / costs.length;
  const maxDailyCost = Math.max(...costs);
  const minDailyCost = Math.min(...costs);

  // Calculate growth rate (first vs last week average)
  let costGrowthRate = 0;
  if (trends.length >= 14) {
    const firstWeekAvg = costs.slice(0, 7).reduce((sum, cost) => sum + cost, 0) / 7;
    const lastWeekAvg = costs.slice(-7).reduce((sum, cost) => sum + cost, 0) / 7;
    if (firstWeekAvg > 0) {
      costGrowthRate = ((lastWeekAvg - firstWeekAvg) / firstWeekAvg) * 100;
    }
  }

  // Calculate volatility (standard deviation)
  const variance = costs.reduce((sum, cost) => sum + Math.pow(cost - averageDailyCost, 2), 0) / costs.length;
  const volatility = Math.sqrt(variance);

  return {
    averageDailyCost: Math.round(averageDailyCost * 100) / 100,
    maxDailyCost: Math.round(maxDailyCost * 100) / 100,
    minDailyCost: Math.round(minDailyCost * 100) / 100,
    costGrowthRate: Math.round(costGrowthRate * 10) / 10,
    volatility: Math.round(volatility * 100) / 100
  };
}

module.exports = router;