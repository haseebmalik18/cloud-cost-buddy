const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AlertHistory = sequelize.define('AlertHistory', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    alert_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Alerts',
        key: 'id',
      },
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id',
      },
    },
    triggered_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    current_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    threshold_value: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    provider: {
      type: DataTypes.STRING(10),
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    notification_sent: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    notification_channels: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
  }, {
    tableName: 'alert_history',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        fields: ['alert_id'],
      },
      {
        fields: ['user_id'],
      },
      {
        fields: ['triggered_at'],
      },
    ],
  });

  return AlertHistory;
};