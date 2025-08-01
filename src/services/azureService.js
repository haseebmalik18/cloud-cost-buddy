const { ConsumptionManagementClient } = require('@azure/arm-consumption');
const { DefaultAzureCredential, ClientSecretCredential } = require('@azure/identity');
const logger = require('../utils/logger');

/**
 * Azure Cost Management Service
 * Handles Azure Cost Management + Billing API integration with Service Principal authentication
 */
class AzureService {
  constructor(userCredentials = null) {
    // Use user credentials if provided, otherwise fall back to environment
    if (userCredentials) {
      this.subscriptionId = userCredentials.subscriptionId;
      this.clientId = userCredentials.clientId;
      this.clientSecret = userCredentials.clientSecret;
      this.tenantId = userCredentials.tenantId;
    } else {
      // Legacy: use environment variables for single-tenant mode
      this.subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
      this.clientId = process.env.AZURE_CLIENT_ID;
      this.clientSecret = process.env.AZURE_CLIENT_SECRET;
      this.tenantId = process.env.AZURE_TENANT_ID;
    }
    
    // Initialize client with appropriate credentials
    this.initializeClient();
  }

  /**
   * Initialize Azure SDK client with Service Principal credentials
   */
  initializeClient() {
    try {
      let credential;

      // Use Service Principal credentials if available, otherwise use default credential chain
      if (this.clientId && this.clientSecret && this.tenantId) {
        credential = new ClientSecretCredential(
          this.tenantId,
          this.clientId,
          this.clientSecret
        );
        logger.info(`Azure client initialized with Service Principal: ${this.clientId}`);
      } else {
        // Use default credential chain (managed identity, environment variables, etc.)
        credential = new DefaultAzureCredential();
        logger.info('Azure client initialized with default credential chain');
      }

      this.consumptionClient = new ConsumptionManagementClient(
        credential,
        this.subscriptionId
      );

    } catch (error) {
      logger.error('Failed to initialize Azure client:', error);
      throw new Error('Azure client initialization failed');
    }
  }

  /**
   * Get current month cost data from Azure
   * @param {Object} options - Query options
   * @returns {Object} Formatted cost data
   */
  async getCurrentMonthCosts(options = {}) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const scope = `/subscriptions/${this.subscriptionId}`;
      
      const queryParameters = {
        type: 'ActualCost',
        timeframe: 'Custom',
        timePeriod: {
          from: startOfMonth.toISOString().split('T')[0],
          to: endOfMonth.toISOString().split('T')[0]
        },
        dataset: {
          granularity: 'Monthly',
          aggregation: {
            totalCost: {
              name: 'Cost',
              function: 'Sum'
            }
          },
          grouping: [
            {
              type: 'Dimension',
              name: 'ServiceName'
            }
          ]
        }
      };

      // Add service filter if specified
      if (options.services && options.services.length > 0) {
        queryParameters.dataset.filter = {
          dimensions: {
            name: 'ServiceName',
            operator: 'In',
            values: options.services
          }
        };
      }

      const result = await this.consumptionClient.usageDetails.list(scope, {
        expand: 'properties/additionalInfo,properties/meterDetails',
        filter: `properties/usageStart ge '${startOfMonth.toISOString()}' and properties/usageEnd le '${endOfMonth.toISOString()}'`,
        top: 1000
      });

      return this.formatCostResponse(result, startOfMonth, endOfMonth);

    } catch (error) {
      logger.error('Error fetching Azure current month costs:', error);
      throw new Error(`Failed to fetch Azure costs: ${error.message}`);
    }
  }

  /**
   * Get cost trends for specified time period
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @param {string} granularity - Daily or Monthly
   * @returns {Object} Formatted trends data
   */
  async getCostTrends(startDate, endDate, granularity = 'Daily') {
    try {
      const scope = `/subscriptions/${this.subscriptionId}`;
      
      const result = await this.consumptionClient.usageDetails.list(scope, {
        expand: 'properties/additionalInfo,properties/meterDetails',
        filter: `properties/usageStart ge '${startDate}' and properties/usageEnd le '${endDate}'`,
        top: 5000
      });

      return this.formatTrendsResponse(result, granularity.toLowerCase());

    } catch (error) {
      logger.error('Error fetching Azure cost trends:', error);
      throw new Error(`Failed to fetch Azure cost trends: ${error.message}`);
    }
  }

  /**
   * Get top cost-driving Azure services
   * @param {number} limit - Number of top services to return
   * @returns {Array} Top services with costs
   */
  async getTopServices(limit = 5) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const scope = `/subscriptions/${this.subscriptionId}`;
      
      const result = await this.consumptionClient.usageDetails.list(scope, {
        expand: 'properties/additionalInfo,properties/meterDetails',
        filter: `properties/usageStart ge '${startOfMonth.toISOString()}' and properties/usageEnd le '${endOfMonth.toISOString()}'`,
        top: 1000
      });

      const servicesCosts = new Map();
      
      for await (const usage of result) {
        const serviceName = usage.instanceName || usage.meterDetails?.meterName || 'Unknown Service';
        const cost = usage.cost || 0;
        const currency = usage.billingCurrency || 'USD';
        
        if (servicesCosts.has(serviceName)) {
          servicesCosts.get(serviceName).cost += cost;
        } else {
          servicesCosts.set(serviceName, {
            serviceName,
            cost,
            currency
          });
        }
      }

      // Convert to array and sort by cost descending
      return Array.from(servicesCosts.values())
        .sort((a, b) => b.cost - a.cost)
        .slice(0, limit);

    } catch (error) {
      logger.error('Error fetching Azure top services:', error);
      throw new Error(`Failed to fetch Azure top services: ${error.message}`);
    }
  }

  /**
   * Get Azure budget information using Consumption Management API
   * @returns {Array} Budget information
   */
  async getBudgets() {
    try {
      // Azure budgets are managed through the Consumption Management API
      // Note: This requires 'Microsoft.Consumption/budgets/read' permission
      
      const scope = `/subscriptions/${this.subscriptionId}`;
      
      // Get current month costs for actual spend calculation
      const currentCosts = await this.getCurrentMonthCosts();
      
      try {
        // Attempt to get actual budgets using the budgets operations
        const budgets = await this.consumptionClient.budgets.list(scope);
        
        const budgetInfo = [];
        for await (const budget of budgets) {
          const budgetLimit = budget.amount || 1000;
          const actualSpend = currentCosts.totalCost;
          
          // Calculate forecasted spend based on current month progress
          const now = new Date();
          const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
          const dayOfMonth = now.getDate();
          const forecastedSpend = (actualSpend / dayOfMonth) * daysInMonth;

          budgetInfo.push({
            budgetName: budget.name || 'Azure Budget',
            budgetLimit: parseFloat(budgetLimit),
            actualSpend,
            forecastedSpend,
            currency: budget.currency || 'USD',
            timeUnit: budget.timeGrain || 'Monthly',
            budgetType: 'Cost',
            utilizationPercentage: (actualSpend / parseFloat(budgetLimit)) * 100,
            budgetId: budget.id
          });
        }

        if (budgetInfo.length > 0) {
          logger.info(`Azure budgets retrieved: ${budgetInfo.length} budgets found`);
          return budgetInfo;
        }
      } catch (budgetError) {
        logger.warn('Azure budgets API not accessible, creating estimated budget:', budgetError.message);
      }

      // Fallback: create estimated budget based on current spend
      const estimatedBudget = Math.max(currentCosts.totalCost * 1.5, 1000); // 150% of current spend or $1000 minimum
      const actualSpend = currentCosts.totalCost;
      
      // Calculate forecasted spend
      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dayOfMonth = now.getDate();
      const forecastedSpend = (actualSpend / dayOfMonth) * daysInMonth;

      return [{
        budgetName: 'Estimated Monthly Budget',
        budgetLimit: estimatedBudget,
        actualSpend,
        forecastedSpend,
        currency: 'USD',
        timeUnit: 'Monthly',
        budgetType: 'Cost',
        utilizationPercentage: (actualSpend / estimatedBudget) * 100,
        budgetId: 'estimated-budget'
      }];

    } catch (error) {
      logger.error('Error fetching Azure budgets:', error);
      throw new Error(`Failed to fetch Azure budgets: ${error.message}`);
    }
  }

  /**
   * Get cost forecast for next month using Azure Cost Management Forecast API
   * @returns {Object} Forecast data
   */
  async getCostForecast() {
    try {
      const now = new Date();
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 1);
      
      const scope = `/subscriptions/${this.subscriptionId}`;

      try {
        // Use Azure Cost Management Forecast API if available
        const forecastParams = {
          type: 'Usage', // or 'ActualCost'
          timeframe: 'Custom',
          timePeriod: {
            from: startOfNextMonth.toISOString().split('T')[0],
            to: endOfNextMonth.toISOString().split('T')[0]
          },
          dataset: {
            granularity: 'Monthly',
            aggregation: {
              totalCost: {
                name: 'Cost',
                function: 'Sum'
              }
            }
          },
          includeActualCost: false,
          includeFreshPartialCost: false
        };

        // Use Azure Cost Management Forecast REST API
        const forecastResponse = await this.queryForecastAPI(scope, forecastParams);
        
        if (forecastResponse && forecastResponse.properties && forecastResponse.properties.rows) {
          const forecastCost = forecastResponse.properties.rows.reduce((sum, row) => sum + (row[0] || 0), 0);
          
          return {
            forecastedCost: forecastCost,
            currency: 'USD',
            period: {
              start: startOfNextMonth.toISOString().split('T')[0],
              end: endOfNextMonth.toISOString().split('T')[0]
            },
            confidence: 'high',
            method: 'azure_forecast_api'
          };
        }
      } catch (forecastError) {
        logger.warn('Azure Forecast API not accessible, using trend-based forecast:', forecastError.message);
      }

      // Fallback: trend-based forecast using historical data
      const currentCosts = await this.getCurrentMonthCosts();
      const previousMonthCosts = await this.getPreviousMonthCosts();
      
      // Calculate trend
      let trendMultiplier = 1.0;
      if (previousMonthCosts && previousMonthCosts.totalCost > 0) {
        trendMultiplier = currentCosts.totalCost / previousMonthCosts.totalCost;
        // Cap extreme variations
        trendMultiplier = Math.max(0.5, Math.min(2.0, trendMultiplier));
      }
      
      // Apply seasonal adjustments (higher costs in business months)
      const nextMonth = startOfNextMonth.getMonth();
      const seasonalMultiplier = [1.0, 1.1, 1.1, 1.1, 1.1, 1.0, 0.9, 0.9, 1.1, 1.1, 1.1, 0.95][nextMonth];
      
      const forecastedCost = currentCosts.totalCost * trendMultiplier * seasonalMultiplier;
      
      return {
        forecastedCost,
        currency: currentCosts.currency,
        period: {
          start: startOfNextMonth.toISOString().split('T')[0],
          end: endOfNextMonth.toISOString().split('T')[0]
        },
        confidence: 'medium',
        method: 'trend_analysis'
      };

    } catch (error) {
      logger.error('Error generating Azure cost forecast:', error);
      throw new Error(`Failed to generate Azure cost forecast: ${error.message}`);
    }
  }

  /**
   * Get previous month costs for trend analysis
   * @returns {Object} Previous month cost data
   */
  async getPreviousMonthCosts() {
    try {
      const now = new Date();
      const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfPrevMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const scope = `/subscriptions/${this.subscriptionId}`;
      
      const result = await this.consumptionClient.usageDetails.list(scope, {
        expand: 'properties/additionalInfo,properties/meterDetails',
        filter: `properties/usageStart ge '${startOfPrevMonth.toISOString()}' and properties/usageEnd le '${endOfPrevMonth.toISOString()}'`,
        top: 1000
      });

      return this.formatCostResponse(result, startOfPrevMonth, endOfPrevMonth);

    } catch (error) {
      logger.warn('Failed to get previous month costs for trend analysis:', error);
      return null;
    }
  }

  /**
   * Query Azure Cost Management Forecast API via REST
   * @param {string} scope - Azure scope
   * @param {Object} params - Forecast parameters
   * @returns {Object} Forecast response
   */
  async queryForecastAPI(scope, params) {
    try {
      const axios = require('axios');
      
      // Get access token from the credential
      const tokenResponse = await this.consumptionClient.credential.getToken([
        'https://management.azure.com/.default'
      ]);

      if (!tokenResponse || !tokenResponse.token) {
        throw new Error('Failed to acquire Azure access token');
      }

      const url = `https://management.azure.com${scope}/providers/Microsoft.CostManagement/forecast`;
      
      const response = await axios.post(url, params, {
        headers: {
          'Authorization': `Bearer ${tokenResponse.token}`,
          'Content-Type': 'application/json'
        },
        params: {
          'api-version': '2021-10-01'
        },
        timeout: 30000
      });

      logger.info('Azure Forecast API call successful');
      return response.data;

    } catch (error) {
      if (error.response) {
        logger.warn(`Azure Forecast API returned ${error.response.status}: ${error.response.data?.error?.message || error.message}`);
      } else {
        logger.warn('Azure Forecast API call failed:', error.message);
      }
      return null;
    }
  }

  /**
   * Format Azure cost response
   * @param {Object} result - Raw Azure API response
   * @param {Date} startDate - Period start date
   * @param {Date} endDate - Period end date
   * @returns {Object} Formatted response
   */
  formatCostResponse(result, startDate, endDate) {
    const response = {
      totalCost: 0,
      currency: 'USD',
      services: [],
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      }
    };

    const servicesMap = new Map();

    try {
      // Process usage details
      for (const usage of result) {
        if (!usage || typeof usage.cost !== 'number') continue;
        
        const serviceName = usage.instanceName || usage.meterDetails?.meterName || 'Unknown Service';
        const cost = usage.cost || 0;
        const currency = usage.billingCurrency || 'USD';
        
        response.totalCost += cost;
        response.currency = currency;
        
        if (servicesMap.has(serviceName)) {
          servicesMap.get(serviceName).cost += cost;
        } else {
          servicesMap.set(serviceName, {
            name: serviceName,
            cost,
            currency
          });
        }
      }

      // Convert services map to array and sort by cost
      response.services = Array.from(servicesMap.values())
        .sort((a, b) => b.cost - a.cost);

    } catch (error) {
      logger.error('Error formatting Azure cost response:', error);
    }

    return response;
  }

  /**
   * Format trends response for time series data
   * @param {Object} result - Raw Azure API response
   * @param {string} granularity - daily or monthly
   * @returns {Object} Formatted trends data
   */
  formatTrendsResponse(result, granularity) {
    const response = {
      trends: [],
      totalCost: 0,
      currency: 'USD'
    };

    const trendsMap = new Map();

    try {
      for (const usage of result) {
        if (!usage || typeof usage.cost !== 'number') continue;
        
        const cost = usage.cost || 0;
        const currency = usage.billingCurrency || 'USD';
        const usageDate = usage.date || usage.usageStart;
        
        if (!usageDate) continue;
        
        let dateKey;
        if (granularity === 'daily') {
          dateKey = new Date(usageDate).toISOString().split('T')[0];
        } else {
          const date = new Date(usageDate);
          dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
        }
        
        response.totalCost += cost;
        response.currency = currency;
        
        if (trendsMap.has(dateKey)) {
          trendsMap.get(dateKey).cost += cost;
        } else {
          trendsMap.set(dateKey, {
            date: dateKey,
            cost,
            currency
          });
        }
      }

      // Convert to array and sort by date
      response.trends = Array.from(trendsMap.values())
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    } catch (error) {
      logger.error('Error formatting Azure trends response:', error);
    }

    return response;
  }

  /**
   * Test Azure connection and permissions
   * @returns {Object} Connection test results
   */
  async testConnection() {
    try {
      // Test by fetching a small amount of usage data
      const scope = `/subscriptions/${this.subscriptionId}`;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const result = await this.consumptionClient.usageDetails.list(scope, {
        top: 1,
        filter: `properties/usageStart ge '${yesterday.toISOString().split('T')[0]}'`
      });

      // Try to get the first item to test permissions
      const firstItem = await result.next();
      
      logger.info('Azure connection test successful');
      return {
        success: true,
        message: 'Azure Cost Management connection successful',
        subscriptionId: this.subscriptionId,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Azure connection test failed:', error);
      return {
        success: false,
        message: `Azure connection failed: ${error.message}`,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = AzureService;