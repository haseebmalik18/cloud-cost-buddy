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

// Define associations
User.hasMany(CloudAccount, { foreignKey: 'user_id', as: 'cloudAccounts' });
CloudAccount.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Export models and sequelize instance
module.exports = {
  sequelize,
  User,
  CloudAccount,
};