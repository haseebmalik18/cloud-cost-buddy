const AWSService = require('./awsService');
const AzureService = require('./azureService');
const GCPService = require('./gcpService');
const { CloudAccount } = require('../models');
const logger = require('../utils/logger');

/**
 * Factory for creating cloud service instances with user credentials
 */
class CloudServiceFactory {
  
  /**
   * Get AWS service instance for user's account
   * @param {string} userId - User ID
   * @param {string} accountId - AWS Account ID (optional, uses first if not specified)
   * @returns {AWSService} Configured AWS service instance
   */
  static async getAWSService(userId, accountId = null) {
    try {
      const where = { user_id: userId, provider: 'aws', is_active: true };
      if (accountId) {
        where.account_id = accountId;
      }

      const cloudAccount = await CloudAccount.findOne({ where });
      
      if (!cloudAccount) {
        throw new Error('No active AWS account found for user');
      }

      const credentials = cloudAccount.decryptCredentials();
      
      // Create AWS service with user's credentials
      const awsService = new AWSService({
        roleArn: credentials.roleArn,
        externalId: credentials.externalId,
        region: credentials.region || 'us-east-1',
        accountId: cloudAccount.account_id
      });

      // Update sync status
      await cloudAccount.updateSyncStatus('syncing');

      return {
        service: awsService,
        account: cloudAccount
      };

    } catch (error) {
      logger.error('Failed to create AWS service instance', {
        userId,
        accountId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get Azure service instance for user's account
   * @param {string} userId - User ID
   * @param {string} subscriptionId - Azure Subscription ID (optional)
   * @returns {AzureService} Configured Azure service instance
   */
  static async getAzureService(userId, subscriptionId = null) {
    try {
      const where = { user_id: userId, provider: 'azure', is_active: true };
      if (subscriptionId) {
        where.account_id = subscriptionId;
      }

      const cloudAccount = await CloudAccount.findOne({ where });
      
      if (!cloudAccount) {
        throw new Error('No active Azure account found for user');
      }

      const credentials = cloudAccount.decryptCredentials();
      
      // Create Azure service with user's credentials
      const azureService = new AzureService({
        subscriptionId: cloudAccount.account_id,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        tenantId: credentials.tenantId
      });

      // Update sync status
      await cloudAccount.updateSyncStatus('syncing');

      return {
        service: azureService,
        account: cloudAccount
      };

    } catch (error) {
      logger.error('Failed to create Azure service instance', {
        userId,
        subscriptionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get GCP service instance for user's account
   * @param {string} userId - User ID
   * @param {string} projectId - GCP Project ID (optional)
   * @returns {GCPService} Configured GCP service instance
   */
  static async getGCPService(userId, projectId = null) {
    try {
      const where = { user_id: userId, provider: 'gcp', is_active: true };
      if (projectId) {
        where.account_id = projectId;
      }

      const cloudAccount = await CloudAccount.findOne({ where });
      
      if (!cloudAccount) {
        throw new Error('No active GCP account found for user');
      }

      const credentials = cloudAccount.decryptCredentials();
      
      // Create GCP service with user's credentials
      const gcpService = new GCPService({
        projectId: cloudAccount.account_id,
        billingAccountId: credentials.billingAccountId,
        serviceAccountKey: credentials.serviceAccountKey,
        billingDatasetId: credentials.billingDatasetId,
        billingTablePrefix: credentials.billingTablePrefix
      });

      // Update sync status
      await cloudAccount.updateSyncStatus('syncing');

      return {
        service: gcpService,
        account: cloudAccount
      };

    } catch (error) {
      logger.error('Failed to create GCP service instance', {
        userId,
        projectId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get all active cloud services for a user
   * @param {string} userId - User ID
   * @returns {Object} Object with aws, azure, gcp service instances
   */
  static async getAllUserServices(userId) {
    const services = {};
    
    try {
      // Get all active cloud accounts for user
      const cloudAccounts = await CloudAccount.findAll({
        where: { user_id: userId, is_active: true }
      });

      // Create service instances for each provider
      for (const account of cloudAccounts) {
        try {
          switch (account.provider) {
            case 'aws':
              if (!services.aws) services.aws = [];
              const awsInstance = await this.getAWSService(userId, account.account_id);
              services.aws.push(awsInstance);
              break;
              
            case 'azure':
              if (!services.azure) services.azure = [];
              const azureInstance = await this.getAzureService(userId, account.account_id);
              services.azure.push(azureInstance);
              break;
              
            case 'gcp':
              if (!services.gcp) services.gcp = [];
              const gcpInstance = await this.getGCPService(userId, account.account_id);
              services.gcp.push(gcpInstance);
              break;
          }
        } catch (error) {
          logger.warn(`Failed to create ${account.provider} service for account ${account.account_id}`, {
            userId,
            provider: account.provider,
            accountId: account.account_id,
            error: error.message
          });
          
          // Update account sync status to error
          await account.updateSyncStatus('error', error.message);
        }
      }

      return services;

    } catch (error) {
      logger.error('Failed to get user cloud services', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Test connection for a specific cloud account
   * @param {string} userId - User ID
   * @param {string} provider - Cloud provider (aws, azure, gcp)
   * @param {string} accountId - Account ID
   * @returns {Object} Connection test results
   */
  static async testConnection(userId, provider, accountId) {
    try {
      let serviceInstance;
      
      switch (provider) {
        case 'aws':
          serviceInstance = await this.getAWSService(userId, accountId);
          break;
        case 'azure':
          serviceInstance = await this.getAzureService(userId, accountId);
          break;
        case 'gcp':
          serviceInstance = await this.getGCPService(userId, accountId);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      // Test the connection
      const testResult = await serviceInstance.service.testConnection();
      
      // Update account sync status based on test result
      if (testResult.success) {
        await serviceInstance.account.updateSyncStatus('success');
      } else {
        await serviceInstance.account.updateSyncStatus('error', testResult.message);
      }

      return testResult;

    } catch (error) {
      logger.error('Connection test failed', {
        userId,
        provider,
        accountId,
        error: error.message
      });

      // Try to update account status if we can find it
      try {
        const cloudAccount = await CloudAccount.findOne({
          where: { user_id: userId, provider, account_id: accountId }
        });
        if (cloudAccount) {
          await cloudAccount.updateSyncStatus('error', error.message);
        }
      } catch (updateError) {
        logger.warn('Failed to update account sync status', { error: updateError.message });
      }

      return {
        success: false,
        message: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = CloudServiceFactory;