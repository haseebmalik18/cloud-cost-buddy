const { Sequelize } = require('sequelize');
const logger = require('../utils/logger');

// Initialize Sequelize
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: process.env.DATABASE_PATH || './data/cloudcost.db',
  logging: process.env.NODE_ENV === 'development' ? logger.debug : false,
  define: {
    timestamps: true,
    underscored: true,
  },
});

// Import models
const User = require('./User')(sequelize, Sequelize.DataTypes);
const CloudAccount = require('./CloudAccount')(sequelize, Sequelize.DataTypes);
const Alert = require('./Alert')(sequelize, Sequelize.DataTypes);
const AlertHistory = require('./AlertHistory')(sequelize, Sequelize.DataTypes);

// Define associations
User.hasMany(CloudAccount, { foreignKey: 'user_id', as: 'cloudAccounts' });
CloudAccount.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

User.hasMany(Alert, { foreignKey: 'user_id', as: 'alerts' });
Alert.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

CloudAccount.hasMany(Alert, { foreignKey: 'cloud_account_id', as: 'alerts' });
Alert.belongsTo(CloudAccount, { foreignKey: 'cloud_account_id', as: 'cloudAccount' });

Alert.hasMany(AlertHistory, { foreignKey: 'alert_id', as: 'history' });
AlertHistory.belongsTo(Alert, { foreignKey: 'alert_id', as: 'alert' });

User.hasMany(AlertHistory, { foreignKey: 'user_id', as: 'alertHistory' });
AlertHistory.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Export models and sequelize instance
module.exports = {
  sequelize,
  User,
  CloudAccount,
  Alert,
  AlertHistory,
};