const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Alert = sequelize.define('Alert', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
    },
    cloud_account_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'CloudAccounts',
        key: 'id',
      },
    },
    type: {
      type: DataTypes.ENUM('budget_threshold', 'spike_detection', 'daily_summary', 'weekly_summary'),
      allowNull: false,
    },
    provider: {
      type: DataTypes.ENUM('aws', 'azure', 'gcp', 'all'),
      allowNull: false,
      defaultValue: 'all',
    },
    threshold_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    threshold_currency: {
      type: DataTypes.STRING(3),
      allowNull: true,
      defaultValue: 'USD',
    },
    threshold_percentage: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    notification_channels: {
      type: DataTypes.JSON,
      defaultValue: ['push'],
    },
    last_triggered: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  }, {
    tableName: 'alerts',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['user_id'],
      },
      {
        fields: ['type', 'enabled'],
      },
      {
        fields: ['provider'],
      },
    ],
  });

  return Alert;
};