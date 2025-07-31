const { CostExplorerClient, GetCostAndUsageCommand, GetDimensionValuesCommand } = require('@aws-sdk/client-cost-explorer');
const { BudgetsClient, DescribeBudgetsCommand, DescribeBudgetCommand } = require('@aws-sdk/client-budgets');
const { fromIni, fromTemporaryCredentials } = require('@aws-sdk/credential-providers');
const logger = require('../utils/logger');

/**
 * AWS Cost Management Service
 * Handles AWS Cost Explorer and Budgets API integration with secure IAM role access
 */
class AWSService {
  constructor() {
    this.region = process.env.AWS_REGION || 'us-east-1';
    this.roleArn = process.env.AWS_ROLE_ARN;
    
    // Initialize clients with appropriate credentials
    this.initializeClients();
  }

  /**
   * Initialize AWS SDK clients with secure credential chain
   */
  initializeClients() {
    try {
      const credentialOptions = {
        region: this.region,
      };

      // Use IAM role if specified, otherwise use default credential chain
      if (this.roleArn) {
        credentialOptions.credentials = fromTemporaryCredentials({
          params: {
            RoleArn: this.roleArn,
            RoleSessionName: 'CloudCostBuddy-Session',
            DurationSeconds: 3600, // 1 hour session
          },
        });
        logger.info(`AWS clients initialized with IAM role: ${this.roleArn}`);
      } else {
        // Use default credential chain (environment variables, instance profile, etc.)
        credentialOptions.credentials = fromIni();
        logger.info('AWS clients initialized with default credential chain');
      }

      this.costExplorerClient = new CostExplorerClient(credentialOptions);
      this.budgetsClient = new BudgetsClient(credentialOptions);
      
    } catch (error) {
      logger.error('Failed to initialize AWS clients:', error);
      throw new Error('AWS client initialization failed');
    }
  }

  /**
   * Get current month cost and usage data
   * @param {Object} options - Query options
   * @returns {Object} Formatted cost data
   */
  async getCurrentMonthCosts(options = {}) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const params = {
        TimePeriod: {
          Start: startOfMonth.toISOString().split('T')[0],
          End: endOfMonth.toISOString().split('T')[0],
        },
        Granularity: 'MONTHLY',
        Metrics: ['BlendedCost', 'UnblendedCost', 'UsageQuantity'],
        GroupBy: [
          {
            Type: 'DIMENSION',
            Key: 'SERVICE',
          },
        ],
      };

      // Add filters if specified
      if (options.services && options.services.length > 0) {
        params.Filter = {
          Dimensions: {
            Key: 'SERVICE',
            Values: options.services,
          },
        };
      }

      const command = new GetCostAndUsageCommand(params);
      const response = await this.costExplorerClient.send(command);

      return this.formatCostResponse(response);
    } catch (error) {
      logger.error('Error fetching AWS current month costs:', error);
      throw new Error(`Failed to fetch AWS costs: ${error.message}`);
    }
  }

  /**
   * Get cost data for a specific time period
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @param {string} granularity - DAILY, MONTHLY, or HOURLY
   * @returns {Object} Formatted cost trends data
   */
  async getCostTrends(startDate, endDate, granularity = 'DAILY') {
    try {
      const params = {
        TimePeriod: {
          Start: startDate,
          End: endDate,
        },
        Granularity: granularity,
        Metrics: ['BlendedCost'],
        GroupBy: [
          {
            Type: 'DIMENSION',
            Key: 'SERVICE',
          },
        ],
      };

      const command = new GetCostAndUsageCommand(params);
      const response = await this.costExplorerClient.send(command);

      return this.formatTrendsResponse(response);
    } catch (error) {
      logger.error('Error fetching AWS cost trends:', error);
      throw new Error(`Failed to fetch AWS cost trends: ${error.message}`);
    }
  }

  /**
   * Get top cost-driving services
   * @param {number} limit - Number of top services to return
   * @returns {Array} Top services with costs
   */
  async getTopServices(limit = 5) {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const params = {
        TimePeriod: {
          Start: startOfMonth.toISOString().split('T')[0],
          End: endOfMonth.toISOString().split('T')[0],
        },
        Granularity: 'MONTHLY',
        Metrics: ['BlendedCost'],
        GroupBy: [
          {
            Type: 'DIMENSION',
            Key: 'SERVICE',
          },
        ],
      };

      const command = new GetCostAndUsageCommand(params);
      const response = await this.costExplorerClient.send(command);

      const services = [];
      
      if (response.ResultsByTime && response.ResultsByTime.length > 0) {
        const results = response.ResultsByTime[0];
        
        results.Groups?.forEach((group) => {
          const serviceName = group.Keys?.[0] || 'Unknown Service';
          const cost = parseFloat(group.Metrics?.BlendedCost?.Amount || '0');
          
          services.push({
            serviceName,
            cost,
            currency: group.Metrics?.BlendedCost?.Unit || 'USD',
          });
        });
      }

      // Sort by cost descending and return top N
      return services
        .sort((a, b) => b.cost - a.cost)
        .slice(0, limit);

    } catch (error) {
      logger.error('Error fetching AWS top services:', error);
      throw new Error(`Failed to fetch AWS top services: ${error.message}`);
    }
  }

  /**
   * Get budget information
   * @param {string} accountId - AWS Account ID
   * @returns {Array} Budget information
   */
  async getBudgets(accountId) {
    try {
      if (!accountId) {
        throw new Error('AWS Account ID is required for budget queries');
      }

      const command = new DescribeBudgetsCommand({
        AccountId: accountId,
      });

      const response = await this.budgetsClient.send(command);
      
      return response.Budgets?.map((budget) => ({
        budgetName: budget.BudgetName,
        budgetLimit: parseFloat(budget.BudgetLimit?.Amount || '0'),
        actualSpend: parseFloat(budget.CalculatedSpend?.ActualSpend?.Amount || '0'),
        forecastedSpend: parseFloat(budget.CalculatedSpend?.ForecastedSpend?.Amount || '0'),
        currency: budget.BudgetLimit?.Unit || 'USD',
        timeUnit: budget.TimeUnit,
        budgetType: budget.BudgetType,
        utilizationPercentage: budget.CalculatedSpend?.ActualSpend?.Amount && budget.BudgetLimit?.Amount
          ? (parseFloat(budget.CalculatedSpend.ActualSpend.Amount) / parseFloat(budget.BudgetLimit.Amount)) * 100
          : 0,
      })) || [];

    } catch (error) {
      logger.error('Error fetching AWS budgets:', error);
      throw new Error(`Failed to fetch AWS budgets: ${error.message}`);
    }
  }

  /**
   * Get cost forecast for next month
   * @returns {Object} Forecast data
   */
  async getCostForecast() {
    try {
      const now = new Date();
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const endOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 2, 1);

      const params = {
        TimePeriod: {
          Start: startOfNextMonth.toISOString().split('T')[0],
          End: endOfNextMonth.toISOString().split('T')[0],
        },
        Metric: 'BLENDED_COST',
        Granularity: 'MONTHLY',
      };

      const command = new GetCostAndUsageCommand(params);
      const response = await this.costExplorerClient.send(command);

      if (response.ResultsByTime && response.ResultsByTime.length > 0) {
        const forecastData = response.ResultsByTime[0];
        return {
          forecastedCost: parseFloat(forecastData.Total?.BlendedCost?.Amount || '0'),
          currency: forecastData.Total?.BlendedCost?.Unit || 'USD',
          period: {
            start: startOfNextMonth.toISOString().split('T')[0],
            end: endOfNextMonth.toISOString().split('T')[0],
          },
        };
      }

      return null;
    } catch (error) {
      logger.error('Error fetching AWS cost forecast:', error);
      throw new Error(`Failed to fetch AWS cost forecast: ${error.message}`);
    }
  }

  /**
   * Format Cost Explorer API response
   * @param {Object} response - Raw API response
   * @returns {Object} Formatted response
   */
  formatCostResponse(response) {
    const result = {
      totalCost: 0,
      currency: 'USD',
      services: [],
      period: {},
    };

    if (response.ResultsByTime && response.ResultsByTime.length > 0) {
      const data = response.ResultsByTime[0];
      
      // Set period information
      result.period = {
        start: data.TimePeriod?.Start,
        end: data.TimePeriod?.End,
      };

      // Calculate total cost
      result.totalCost = parseFloat(data.Total?.BlendedCost?.Amount || '0');
      result.currency = data.Total?.BlendedCost?.Unit || 'USD';

      // Process service-level data
      data.Groups?.forEach((group) => {
        const serviceName = group.Keys?.[0] || 'Unknown Service';
        const cost = parseFloat(group.Metrics?.BlendedCost?.Amount || '0');
        
        result.services.push({
          name: serviceName,
          cost,
          currency: group.Metrics?.BlendedCost?.Unit || 'USD',
        });
      });

      // Sort services by cost descending
      result.services.sort((a, b) => b.cost - a.cost);
    }

    return result;
  }

  /**
   * Format trends response for time series data
   * @param {Object} response - Raw API response
   * @returns {Object} Formatted trends data
   */
  formatTrendsResponse(response) {
    const result = {
      trends: [],
      totalCost: 0,
      currency: 'USD',
    };

    if (response.ResultsByTime) {
      response.ResultsByTime.forEach((timeData) => {
        const dailyCost = parseFloat(timeData.Total?.BlendedCost?.Amount || '0');
        result.totalCost += dailyCost;
        
        result.trends.push({
          date: timeData.TimePeriod?.Start,
          cost: dailyCost,
          currency: timeData.Total?.BlendedCost?.Unit || 'USD',
        });
      });

      result.currency = response.ResultsByTime[0]?.Total?.BlendedCost?.Unit || 'USD';
    }

    return result;
  }

  /**
   * Test AWS connection and permissions
   * @returns {Object} Connection test results
   */
  async testConnection() {
    try {
      // Test Cost Explorer access
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const testParams = {
        TimePeriod: {
          Start: yesterday.toISOString().split('T')[0],
          End: now.toISOString().split('T')[0],
        },
        Granularity: 'DAILY',
        Metrics: ['BlendedCost'],
      };

      const command = new GetCostAndUsageCommand(testParams);
      await this.costExplorerClient.send(command);

      logger.info('AWS connection test successful');
      return {
        success: true,
        message: 'AWS Cost Explorer connection successful',
        timestamp: new Date().toISOString(),
      };

    } catch (error) {
      logger.error('AWS connection test failed:', error);
      return {
        success: false,
        message: `AWS connection failed: ${error.message}`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

module.exports = AWSService;