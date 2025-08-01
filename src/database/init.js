const { sequelize } = require('../models');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Initialize database and create tables
 */
async function initializeDatabase() {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(process.env.DATABASE_PATH || './data/cloudcost.db');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      logger.info(`Created data directory: ${dataDir}`);
    }

    // Test database connection
    await sequelize.authenticate();
    logger.info('Database connection established successfully');

    // Sync all models (create tables)
    await sequelize.sync({ 
      force: process.env.NODE_ENV === 'development' && process.env.FORCE_DB_SYNC === 'true',
      alter: process.env.NODE_ENV === 'development'
    });
    
    // Create sessions table for OAuth
    const SequelizeStore = require('connect-session-sequelize')(require('express-session').Store);
    const sessionStore = new SequelizeStore({
      db: sequelize,
      tableName: 'sessions'
    });
    await sessionStore.sync();
    
    logger.info('Database tables synchronized successfully');

    // Create indexes for better performance
    await createIndexes();

    return true;
  } catch (error) {
    logger.error('Unable to initialize database:', error);
    throw error;
  }
}

/**
 * Create additional database indexes for performance
 */
async function createIndexes() {
  try {
    const queryInterface = sequelize.getQueryInterface();

    // Create indexes if they don't exist
    const indexes = [
      {
        table: 'users',
        fields: ['email'],
        name: 'idx_users_email'
      },
      {
        table: 'users', 
        fields: ['is_active'],
        name: 'idx_users_active'
      },
      {
        table: 'cloud_accounts',
        fields: ['user_id', 'provider'],
        name: 'idx_cloud_accounts_user_provider'
      },
      {
        table: 'cloud_accounts',
        fields: ['user_id', 'is_active'],
        name: 'idx_cloud_accounts_user_active'
      },
      {
        table: 'cloud_accounts',
        fields: ['provider', 'account_id'],
        name: 'idx_cloud_accounts_provider_account'
      },
      {
        table: 'cloud_accounts',
        fields: ['sync_status'],
        name: 'idx_cloud_accounts_sync_status'
      }
    ];

    for (const index of indexes) {
      try {
        await queryInterface.addIndex(index.table, index.fields, {
          name: index.name,
          concurrently: true
        });
        logger.debug(`Created index ${index.name}`);
      } catch (error) {
        // Index might already exist, ignore error
        if (!error.message.includes('already exists')) {
          logger.warn(`Failed to create index ${index.name}:`, error.message);
        }
      }
    }

    logger.info('Database indexes created successfully');
  } catch (error) {
    logger.warn('Failed to create some database indexes:', error);
  }
}

/**
 * Close database connection
 */
async function closeDatabase() {
  try {
    await sequelize.close();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error closing database connection:', error);
  }
}

/**
 * Drop all tables (use with caution!)
 */
async function dropAllTables() {
  try {
    await sequelize.drop();
    logger.info('All database tables dropped');
  } catch (error) {
    logger.error('Error dropping database tables:', error);
    throw error;
  }
}

/**
 * Get database health status
 */
async function getDatabaseHealth() {
  try {
    await sequelize.authenticate();
    
    // Get table counts
    const [userCount] = await sequelize.query('SELECT COUNT(*) as count FROM users WHERE is_active = 1');
    const [accountCount] = await sequelize.query('SELECT COUNT(*) as count FROM cloud_accounts WHERE is_active = 1');
    
    return {
      status: 'healthy',
      connection: 'connected',
      users: userCount[0].count,
      cloudAccounts: accountCount[0].count,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      connection: 'failed',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  initializeDatabase,
  closeDatabase,
  dropAllTables,
  getDatabaseHealth,
  sequelize
};