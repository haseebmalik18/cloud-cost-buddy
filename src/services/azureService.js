const { ConsumptionManagementClient } = require('@azure/arm-consumption');
const { DefaultAzureCredential, ClientSecretCredential } = require('@azure/identity');
const logger = require('../utils/logger');

/**
 * Azure Cost Management Service
 * Handles Azure Cost Management + Billing API integration with Service Principal authentication
 */
class AzureService {
  constructor() {
    this.subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
    this.clientId = process.env.AZURE_CLIENT_ID;
    this.clientSecret = process.env.AZURE_CLIENT_SECRET;
    this.tenantId = process.env.AZURE_TENANT_ID;
    
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
   * Get Azure budget information
   * @returns {Array} Budget information
   */
  async getBudgets() {
    try {
      // Note: Azure Budgets require separate API calls and different permissions
      // For this implementation, we'll return a placeholder
      // In production, you'd use the @azure/arm-consumption BudgetsOperations
      
      logger.info('Azure budgets API requires additional setup - returning placeholder');
      
      return [
        {
          budgetName: 'Azure Subscription Budget',
          budgetLimit: 1000,
          actualSpend: 0,
          forecastedSpend: 0,
          currency: 'USD',
          timeUnit: 'Monthly',
          budgetType: 'Cost',
          utilizationPercentage: 0
        }
      ];

    } catch (error) {
      logger.error('Error fetching Azure budgets:', error);
      throw new Error(`Failed to fetch Azure budgets: ${error.message}`);
    }
  }

  /**
   * Get cost forecast for next month
   * @returns {Object} Forecast data
   */
  async getCostForecast() {
    try {
      // Azure Cost Management API has limited forecasting capabilities
      // This would typically require machine learning or historical analysis
      const currentCosts = await this.getCurrentMonthCosts();
      
      // Simple forecast based on current month usage (placeholder logic)
      const forecastMultiplier = 1.1; // 10% increase estimate
      
      return {
        forecastedCost: currentCosts.totalCost * forecastMultiplier,
        currency: currentCosts.currency,
        period: {
          start: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().split('T')[0],
          end: new Date(new Date().getFullYear(), new Date().getMonth() + 2, 1).toISOString().split('T')[0]
        },
        confidence: 'medium', // Placeholder confidence level
        method: 'historical_trend'
      };

    } catch (error) {
      logger.error('Error generating Azure cost forecast:', error);
      throw new Error(`Failed to generate Azure cost forecast: ${error.message}`);
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