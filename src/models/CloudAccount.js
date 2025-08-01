const CryptoJS = require('crypto-js');

module.exports = (sequelize, DataTypes) => {
  const CloudAccount = sequelize.define('CloudAccount', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id',
      },
    },
    provider: {
      type: DataTypes.ENUM('aws', 'azure', 'gcp'),
      allowNull: false,
    },
    account_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    account_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    credentials_encrypted: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    last_sync: {
      type: DataTypes.DATE,
    },
    sync_status: {
      type: DataTypes.ENUM('pending', 'syncing', 'success', 'error'),
      defaultValue: 'pending',
    },
    error_message: {
      type: DataTypes.TEXT,
    },
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {},
    },
  }, {
    tableName: 'cloud_accounts',
    indexes: [
      {
        fields: ['user_id', 'provider'],
      },
      {
        unique: true,
        fields: ['user_id', 'provider', 'account_id'],
      },
    ],
  });

  // Instance methods
  CloudAccount.prototype.encryptCredentials = function(credentials) {
    const secretKey = process.env.ENCRYPTION_KEY;
    if (!secretKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required for credential encryption');
    }
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(credentials), secretKey).toString();
    this.credentials_encrypted = encrypted;
  };

  CloudAccount.prototype.decryptCredentials = function() {
    const secretKey = process.env.ENCRYPTION_KEY;
    if (!secretKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required for credential decryption');
    }
    const bytes = CryptoJS.AES.decrypt(this.credentials_encrypted, secretKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decrypted);
  };

  CloudAccount.prototype.updateSyncStatus = function(status, errorMessage = null) {
    this.sync_status = status;
    this.error_message = errorMessage;
    if (status === 'success') {
      this.last_sync = new Date();
    }
    return this.save();
  };

  CloudAccount.prototype.toJSON = function() {
    const values = Object.assign({}, this.get());
    delete values.credentials_encrypted;
    return values;
  };

  return CloudAccount;
};