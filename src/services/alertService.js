const { Alert, AlertHistory, User, CloudAccount } = require('../models');
const logger = require('../utils/logger');
const notificationService = require('./notificationService');
const awsService = require('./awsService');
const azureService = require('./azureService');
const gcpService = require('./gcpService');

class AlertService {
  constructor() {
    this.providers = {
      aws: awsService,
      azure: azureService,
      gcp: gcpService,
    };
  }

  async createAlert({
    userId,
    cloudAccountId = null,
    type,
    provider = 'all',
    thresholdValue = null,
    thresholdCurrency = 'USD',
    thresholdPercentage = null,
    notificationChannels = ['push']
  }) {
    try {
      const alert = await Alert.create({
        user_id: userId,
        cloud_account_id: cloudAccountId,
        type,
        provider,
        threshold_value: thresholdValue,
        threshold_currency: thresholdCurrency,
        threshold_percentage: thresholdPercentage,
        notification_channels: notificationChannels,
        enabled: true,
      });

      logger.info(`Alert created for user ${userId}`, { alertId: alert.id, type, provider });
      return alert;
    } catch (error) {
      logger.error('Error creating alert:', error);
      throw error;
    }
  }

  async getUserAlerts(userId) {
    try {
      const alerts = await Alert.findAll({
        where: { user_id: userId },
        include: [
          {
            model: CloudAccount,
            as: 'cloudAccount',
            required: false,
          }
        ],
        order: [['created_at', 'DESC']],
      });

      return alerts;
    } catch (error) {
      logger.error('Error fetching user alerts:', error);
      throw error;
    }
  }

  async updateAlert(alertId, userId, updates) {
    try {
      const alert = await Alert.findOne({
        where: { id: alertId, user_id: userId },
      });

      if (!alert) {
        throw new Error('Alert not found');
      }

      await alert.update(updates);
      logger.info(`Alert updated for user ${userId}`, { alertId, updates });
      return alert;
    } catch (error) {
      logger.error('Error updating alert:', error);
      throw error;
    }
  }

  async deleteAlert(alertId, userId) {
    try {
      const deleted = await Alert.destroy({
        where: { id: alertId, user_id: userId },
      });

      if (!deleted) {
        throw new Error('Alert not found');
      }

      logger.info(`Alert deleted for user ${userId}`, { alertId });
      return true;
    } catch (error) {
      logger.error('Error deleting alert:', error);
      throw error;
    }
  }

  async checkBudgetThresholds() {
    try {
      logger.info('Starting budget threshold check');

      const budgetAlerts = await Alert.findAll({
        where: {
          type: 'budget_threshold',
          enabled: true,
        },
        include: [
          {
            model: User,
            as: 'user',
            required: true,
          },
          {
            model: CloudAccount,
            as: 'cloudAccount',
            required: false,
          }
        ],
      });

      for (const alert of budgetAlerts) {
        await this.processBudgetAlert(alert);
      }

      logger.info(`Processed ${budgetAlerts.length} budget alerts`);
    } catch (error) {
      logger.error('Error checking budget thresholds:', error);
      throw error;
    }
  }

  async processBudgetAlert(alert) {
    try {
      const providers = alert.provider === 'all' ? ['aws', 'azure', 'gcp'] : [alert.provider];
      
      for (const provider of providers) {
        const currentCost = await this.getCurrentMonthCost(provider, alert.user_id, alert.cloud_account_id);
        
        if (currentCost >= alert.threshold_value) {
          await this.triggerAlert(alert, currentCost, provider);
        }
      }
    } catch (error) {
      logger.error(`Error processing budget alert ${alert.id}:`, error);
    }
  }

  async checkSpikeDetection() {
    try {
      logger.info('Starting spike detection check');

      const spikeAlerts = await Alert.findAll({
        where: {
          type: 'spike_detection',
          enabled: true,
        },
        include: [
          {
            model: User,
            as: 'user',
            required: true,
          },
          {
            model: CloudAccount,
            as: 'cloudAccount',
            required: false,
          }
        ],
      });

      for (const alert of spikeAlerts) {
        await this.processSpikeAlert(alert);
      }

      logger.info(`Processed ${spikeAlerts.length} spike detection alerts`);
    } catch (error) {
      logger.error('Error checking spike detection:', error);
      throw error;
    }
  }

  async processSpikeAlert(alert) {
    try {
      const providers = alert.provider === 'all' ? ['aws', 'azure', 'gcp'] : [alert.provider];
      
      for (const provider of providers) {
        const { currentCost, baselineCost } = await this.getCostComparison(provider, alert.user_id, alert.cloud_account_id);
        
        if (baselineCost > 0) {
          const percentageIncrease = ((currentCost - baselineCost) / baselineCost) * 100;
          const thresholdPercentage = alert.threshold_percentage || 20;
          
          if (percentageIncrease >= thresholdPercentage) {
            await this.triggerSpikeAlert(alert, currentCost, baselineCost, percentageIncrease, provider);
          }
        }
      }
    } catch (error) {
      logger.error(`Error processing spike alert ${alert.id}:`, error);
    }
  }

  async getCurrentMonthCost(provider, userId, cloudAccountId = null) {
    try {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const endDate = now.toISOString().split('T')[0];

      const service = this.providers[provider];
      if (!service) {
        throw new Error(`Provider ${provider} not supported`);
      }

      const costData = await service.getCosts({ startDate, endDate, granularity: 'Monthly' });
      return costData.totalCost || 0;
    } catch (error) {
      logger.error(`Error getting current month cost for ${provider}:`, error);
      return 0;
    }
  }

  async getCostComparison(provider, userId, cloudAccountId = null) {
    try {
      const now = new Date();
      
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentMonthEnd = new Date();
      
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

      const service = this.providers[provider];
      if (!service) {
        throw new Error(`Provider ${provider} not supported`);
      }

      const [currentCostData, baselineCostData] = await Promise.all([
        service.getCosts({
          startDate: currentMonthStart.toISOString().split('T')[0],
          endDate: currentMonthEnd.toISOString().split('T')[0],
          granularity: 'Monthly'
        }),
        service.getCosts({
          startDate: lastMonthStart.toISOString().split('T')[0],
          endDate: lastMonthEnd.toISOString().split('T')[0],
          granularity: 'Monthly'
        })
      ]);

      return {
        currentCost: currentCostData.totalCost || 0,
        baselineCost: baselineCostData.totalCost || 0,
      };
    } catch (error) {
      logger.error(`Error getting cost comparison for ${provider}:`, error);
      return { currentCost: 0, baselineCost: 0 };
    }
  }

  async triggerAlert(alert, currentValue, provider) {
    try {
      const now = new Date();
      const cooldownPeriod = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
      
      if (alert.last_triggered && (now - new Date(alert.last_triggered)) < cooldownPeriod) {
        logger.debug(`Alert ${alert.id} is in cooldown period`);
        return;
      }

      const message = `Budget threshold exceeded for ${provider.toUpperCase()}. Current spend: $${currentValue.toFixed(2)}, Threshold: $${alert.threshold_value}`;

      await this.createAlertHistory({
        alertId: alert.id,
        userId: alert.user_id,
        currentValue,
        thresholdValue: alert.threshold_value,
        provider,
        message,
        notificationChannels: alert.notification_channels,
      });

      await alert.update({ last_triggered: now });

      await notificationService.sendAlert(alert.user_id, {
        title: 'Budget Threshold Exceeded',
        body: message,
        data: {
          type: 'budget_threshold',
          provider,
          currentValue,
          thresholdValue: alert.threshold_value,
        }
      });

      logger.info(`Budget alert triggered for user ${alert.user_id}`, {
        alertId: alert.id,
        provider,
        currentValue,
        thresholdValue: alert.threshold_value,
      });
    } catch (error) {
      logger.error(`Error triggering alert ${alert.id}:`, error);
    }
  }

  async triggerSpikeAlert(alert, currentValue, baselineValue, percentageIncrease, provider) {
    try {
      const now = new Date();
      const cooldownPeriod = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
      
      if (alert.last_triggered && (now - new Date(alert.last_triggered)) < cooldownPeriod) {
        logger.debug(`Spike alert ${alert.id} is in cooldown period`);
        return;
      }

      const message = `Cost spike detected for ${provider.toUpperCase()}. Current: $${currentValue.toFixed(2)}, Previous: $${baselineValue.toFixed(2)} (+${percentageIncrease.toFixed(1)}%)`;

      await this.createAlertHistory({
        alertId: alert.id,
        userId: alert.user_id,
        currentValue,
        thresholdValue: baselineValue,
        provider,
        message,
        notificationChannels: alert.notification_channels,
        metadata: {
          percentageIncrease,
          baselineValue,
        }
      });

      await alert.update({ last_triggered: now });

      await notificationService.sendAlert(alert.user_id, {
        title: 'Cost Spike Detected',
        body: message,
        data: {
          type: 'spike_detection',
          provider,
          currentValue,
          baselineValue,
          percentageIncrease,
        }
      });

      logger.info(`Spike alert triggered for user ${alert.user_id}`, {
        alertId: alert.id,
        provider,
        currentValue,
        baselineValue,
        percentageIncrease,
      });
    } catch (error) {
      logger.error(`Error triggering spike alert ${alert.id}:`, error);
    }
  }

  async createAlertHistory({
    alertId,
    userId,
    currentValue,
    thresholdValue,
    provider,
    message,
    notificationChannels = [],
    metadata = {}
  }) {
    try {
      const history = await AlertHistory.create({
        alert_id: alertId,
        user_id: userId,
        current_value: currentValue,
        threshold_value: thresholdValue,
        provider,
        message,
        notification_sent: true,
        notification_channels: notificationChannels,
        metadata,
      });

      return history;
    } catch (error) {
      logger.error('Error creating alert history:', error);
      throw error;
    }
  }

  async getAlertHistory(userId, { limit = 50, offset = 0 } = {}) {
    try {
      const history = await AlertHistory.findAll({
        where: { user_id: userId },
        include: [
          {
            model: Alert,
            as: 'alert',
            required: true,
          }
        ],
        order: [['triggered_at', 'DESC']],
        limit,
        offset,
      });

      return history;
    } catch (error) {
      logger.error('Error fetching alert history:', error);
      throw error;
    }
  }

  async runAlertChecks() {
    try {
      logger.info('Running scheduled alert checks');
      
      await Promise.all([
        this.checkBudgetThresholds(),
        this.checkSpikeDetection(),
      ]);
      
      logger.info('Completed scheduled alert checks');
    } catch (error) {
      logger.error('Error running alert checks:', error);
      throw error;
    }
  }
}

module.exports = new AlertService();