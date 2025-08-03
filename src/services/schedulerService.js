const cron = require('node-cron');
const logger = require('../utils/logger');
const alertService = require('./alertService');
const notificationService = require('./notificationService');
const { User, CloudAccount } = require('../models');
const awsService = require('./awsService');
const azureService = require('./azureService');
const gcpService = require('./gcpService');

class SchedulerService {
  constructor() {
    this.jobs = new Map();
    this.providers = {
      aws: awsService,
      azure: azureService,
      gcp: gcpService,
    };
  }

  start() {
    logger.info('Starting scheduler service');

    // Check budget thresholds and spike detection every 30 minutes
    this.scheduleJob('alert-checks', '*/30 * * * *', async () => {
      try {
        await alertService.runAlertChecks();
        logger.info('Scheduled alert checks completed');
      } catch (error) {
        logger.error('Error in scheduled alert checks:', error);
      }
    });

    // Send daily cost summaries at 9 AM every day
    this.scheduleJob('daily-summaries', '0 9 * * *', async () => {
      try {
        await this.sendDailySummaries();
        logger.info('Daily summaries sent');
      } catch (error) {
        logger.error('Error sending daily summaries:', error);
      }
    });

    // Send weekly cost summaries on Monday at 9 AM
    this.scheduleJob('weekly-summaries', '0 9 * * 1', async () => {
      try {
        await this.sendWeeklySummaries();
        logger.info('Weekly summaries sent');
      } catch (error) {
        logger.error('Error sending weekly summaries:', error);
      }
    });

    // Database cleanup - remove old alert history (older than 90 days) at 2 AM daily
    this.scheduleJob('cleanup', '0 2 * * *', async () => {
      try {
        await this.cleanupOldData();
        logger.info('Database cleanup completed');
      } catch (error) {
        logger.error('Error in database cleanup:', error);
      }
    });

    logger.info(`Started ${this.jobs.size} scheduled jobs`);
  }

  scheduleJob(name, cronExpression, task) {
    if (this.jobs.has(name)) {
      logger.warn(`Job ${name} already exists, skipping`);
      return;
    }

    const job = cron.schedule(cronExpression, task, {
      scheduled: false,
      timezone: 'UTC'
    });

    job.start();
    this.jobs.set(name, job);
    
    logger.info(`Scheduled job: ${name} with expression: ${cronExpression}`);
  }

  async sendDailySummaries() {
    try {
      const users = await User.findAll({
        include: [
          {
            model: CloudAccount,
            as: 'cloudAccounts',
            required: false,
          }
        ],
        where: {
          is_active: true,
        }
      });

      for (const user of users) {
        try {
          const summaryData = await this.getDailySummaryData(user.id);
          if (summaryData.providers.length > 0) {
            await notificationService.sendDailySummary(user.id, summaryData);
          }
        } catch (error) {
          logger.error(`Error sending daily summary to user ${user.id}:`, error);
        }
      }

      logger.info(`Daily summaries processed for ${users.length} users`);
    } catch (error) {
      logger.error('Error in sendDailySummaries:', error);
      throw error;
    }
  }

  async sendWeeklySummaries() {
    try {
      const users = await User.findAll({
        include: [
          {
            model: CloudAccount,
            as: 'cloudAccounts',
            required: false,
          }
        ],
        where: {
          is_active: true,
        }
      });

      for (const user of users) {
        try {
          const summaryData = await this.getWeeklySummaryData(user.id);
          if (summaryData.totalCost > 0) {
            await notificationService.sendWeeklySummary(user.id, summaryData);
          }
        } catch (error) {
          logger.error(`Error sending weekly summary to user ${user.id}:`, error);
        }
      }

      logger.info(`Weekly summaries processed for ${users.length} users`);
    } catch (error) {
      logger.error('Error in sendWeeklySummaries:', error);
      throw error;
    }
  }

  async getDailySummaryData(userId) {
    try {
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      
      const startDate = yesterday.toISOString().split('T')[0];
      const endDate = today.toISOString().split('T')[0];

      const providerData = [];

      for (const [providerName, service] of Object.entries(this.providers)) {
        try {
          const costData = await service.getCosts({
            startDate,
            endDate,
            granularity: 'Daily'
          });

          if (costData.totalCost > 0) {
            providerData.push({
              provider: providerName,
              cost: costData.totalCost,
              currency: costData.currency || 'USD',
              services: costData.services?.slice(0, 3) || []
            });
          }
        } catch (error) {
          logger.error(`Error getting daily costs for ${providerName}:`, error);
        }
      }

      return {
        date: yesterday.toISOString().split('T')[0],
        providers: providerData,
      };
    } catch (error) {
      logger.error('Error getting daily summary data:', error);
      throw error;
    }
  }

  async getWeeklySummaryData(userId) {
    try {
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
      const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);

      const thisWeekStart = weekAgo.toISOString().split('T')[0];
      const thisWeekEnd = today.toISOString().split('T')[0];
      const lastWeekStart = twoWeeksAgo.toISOString().split('T')[0];
      const lastWeekEnd = weekAgo.toISOString().split('T')[0];

      let totalCost = 0;
      let previousWeekCost = 0;

      for (const [providerName, service] of Object.entries(this.providers)) {
        try {
          const [thisWeekData, lastWeekData] = await Promise.all([
            service.getCosts({
              startDate: thisWeekStart,
              endDate: thisWeekEnd,
              granularity: 'Daily'
            }),
            service.getCosts({
              startDate: lastWeekStart,
              endDate: lastWeekEnd,
              granularity: 'Daily'
            })
          ]);

          totalCost += thisWeekData.totalCost || 0;
          previousWeekCost += lastWeekData.totalCost || 0;
        } catch (error) {
          logger.error(`Error getting weekly costs for ${providerName}:`, error);
        }
      }

      return {
        totalCost,
        previousWeekCost,
        startDate: thisWeekStart,
        endDate: thisWeekEnd,
      };
    } catch (error) {
      logger.error('Error getting weekly summary data:', error);
      throw error;
    }
  }

  async cleanupOldData() {
    try {
      const { AlertHistory } = require('../models');
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const deletedCount = await AlertHistory.destroy({
        where: {
          triggered_at: {
            [require('sequelize').Op.lt]: ninetyDaysAgo
          }
        }
      });

      logger.info(`Cleaned up ${deletedCount} old alert history records`);
    } catch (error) {
      logger.error('Error in database cleanup:', error);
      throw error;
    }
  }

  stop() {
    logger.info('Stopping scheduler service');
    
    for (const [name, job] of this.jobs) {
      job.stop();
      job.destroy();
      logger.info(`Stopped job: ${name}`);
    }
    
    this.jobs.clear();
    logger.info('All scheduled jobs stopped');
  }

  getJobStatus() {
    const status = {};
    for (const [name, job] of this.jobs) {
      status[name] = {
        running: job.running,
        lastExecution: job.lastExecution,
        nextExecution: job.nextExecution
      };
    }
    return status;
  }
}

module.exports = new SchedulerService();