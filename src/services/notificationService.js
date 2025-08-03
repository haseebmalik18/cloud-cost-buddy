const admin = require('firebase-admin');
const { User } = require('../models');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    this.initialized = false;
    this.initializeFirebase();
  }

  initializeFirebase() {
    try {
      if (admin.apps.length === 0) {
        const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
        
        if (!serviceAccount) {
          logger.warn('Firebase service account key not found. Push notifications will be disabled.');
          return;
        }

        admin.initializeApp({
          credential: admin.credential.cert(JSON.parse(serviceAccount)),
          projectId: process.env.FIREBASE_PROJECT_ID,
        });

        this.initialized = true;
        logger.info('Firebase Admin SDK initialized successfully');
      } else {
        this.initialized = true;
        logger.info('Firebase Admin SDK already initialized');
      }
    } catch (error) {
      logger.error('Error initializing Firebase Admin SDK:', error);
      this.initialized = false;
    }
  }

  async registerDeviceToken(userId, token) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const existingTokens = user.fcm_tokens || [];
      const updatedTokens = [...new Set([...existingTokens, token])];

      await user.update({ fcm_tokens: updatedTokens });

      logger.info(`Device token registered for user ${userId}`, { 
        token: token.substring(0, 20) + '...' 
      });

      return true;
    } catch (error) {
      logger.error('Error registering device token:', error);
      throw error;
    }
  }

  async removeDeviceToken(userId, token) {
    try {
      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const existingTokens = user.fcm_tokens || [];
      const updatedTokens = existingTokens.filter(t => t !== token);

      await user.update({ fcm_tokens: updatedTokens });

      logger.info(`Device token removed for user ${userId}`, { 
        token: token.substring(0, 20) + '...' 
      });

      return true;
    } catch (error) {
      logger.error('Error removing device token:', error);
      throw error;
    }
  }

  async sendAlert(userId, { title, body, data = {} }) {
    try {
      if (!this.initialized) {
        logger.warn('Firebase not initialized. Cannot send push notification.');
        return false;
      }

      const user = await User.findByPk(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const tokens = user.fcm_tokens || [];
      if (tokens.length === 0) {
        logger.warn(`No FCM tokens found for user ${userId}`);
        return false;
      }

      const message = {
        notification: {
          title,
          body,
        },
        data: {
          ...data,
          timestamp: new Date().toISOString(),
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channelId: 'cost_alerts',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      const results = await Promise.allSettled(
        tokens.map(token => 
          admin.messaging().send({ ...message, token })
        )
      );

      const invalidTokens = [];
      const successCount = results.reduce((count, result, index) => {
        if (result.status === 'fulfilled') {
          return count + 1;
        } else {
          logger.error(`Failed to send notification to token ${index}:`, result.reason);
          
          if (result.reason?.code === 'messaging/invalid-registration-token' ||
              result.reason?.code === 'messaging/registration-token-not-registered') {
            invalidTokens.push(tokens[index]);
          }
          return count;
        }
      }, 0);

      if (invalidTokens.length > 0) {
        const validTokens = tokens.filter(token => !invalidTokens.includes(token));
        await user.update({ fcm_tokens: validTokens });
        logger.info(`Removed ${invalidTokens.length} invalid tokens for user ${userId}`);
      }

      logger.info(`Sent ${successCount}/${tokens.length} notifications to user ${userId}`, {
        title,
        body,
      });

      return successCount > 0;
    } catch (error) {
      logger.error('Error sending alert notification:', error);
      throw error;
    }
  }

  async sendDailySummary(userId, summaryData) {
    try {
      const totalCost = summaryData.providers.reduce((sum, p) => sum + p.cost, 0);
      
      await this.sendAlert(userId, {
        title: 'Daily Cost Summary',
        body: `Today's cloud spending: $${totalCost.toFixed(2)} across ${summaryData.providers.length} providers`,
        data: {
          type: 'daily_summary',
          totalCost: totalCost.toString(),
          providers: JSON.stringify(summaryData.providers),
        }
      });

      logger.info(`Daily summary sent to user ${userId}`, { totalCost });
    } catch (error) {
      logger.error('Error sending daily summary:', error);
      throw error;
    }
  }

  async sendWeeklySummary(userId, summaryData) {
    try {
      const totalCost = summaryData.totalCost;
      const previousWeekCost = summaryData.previousWeekCost;
      const change = previousWeekCost > 0 ? ((totalCost - previousWeekCost) / previousWeekCost) * 100 : 0;
      const changeText = change > 0 ? `+${change.toFixed(1)}%` : `${change.toFixed(1)}%`;

      await this.sendAlert(userId, {
        title: 'Weekly Cost Summary',
        body: `This week: $${totalCost.toFixed(2)} (${changeText} vs last week)`,
        data: {
          type: 'weekly_summary',
          totalCost: totalCost.toString(),
          previousWeekCost: previousWeekCost.toString(),
          change: change.toString(),
        }
      });

      logger.info(`Weekly summary sent to user ${userId}`, { totalCost, change });
    } catch (error) {
      logger.error('Error sending weekly summary:', error);
      throw error;
    }
  }

  async sendBulkNotification(userIds, { title, body, data = {} }) {
    try {
      if (!this.initialized) {
        logger.warn('Firebase not initialized. Cannot send bulk notifications.');
        return false;
      }

      const users = await User.findAll({
        where: { id: userIds },
        attributes: ['id', 'fcm_tokens'],
      });

      const allTokens = users.reduce((tokens, user) => {
        return [...tokens, ...(user.fcm_tokens || [])];
      }, []);

      if (allTokens.length === 0) {
        logger.warn('No FCM tokens found for bulk notification');
        return false;
      }

      const message = {
        notification: { title, body },
        data: {
          ...data,
          timestamp: new Date().toISOString(),
        },
        tokens: allTokens,
      };

      const response = await admin.messaging().sendMulticast(message);

      logger.info(`Bulk notification sent`, {
        successCount: response.successCount,
        failureCount: response.failureCount,
        totalTokens: allTokens.length,
      });

      return response.successCount > 0;
    } catch (error) {
      logger.error('Error sending bulk notification:', error);
      throw error;
    }
  }

  async testNotification(userId) {
    try {
      await this.sendAlert(userId, {
        title: 'Test Notification',
        body: 'This is a test notification from CloudCost Buddy',
        data: {
          type: 'test',
        }
      });

      logger.info(`Test notification sent to user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error sending test notification:', error);
      throw error;
    }
  }
}

module.exports = new NotificationService();