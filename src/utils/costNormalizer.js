const logger = require('./logger');

/**
 * Cost Normalizer Utility
 * Normalizes cost data from different cloud providers (AWS, Azure, GCP) 
 * into a unified format for consistent dashboard display
 */
class CostNormalizer {
  
  /**
   * Normalize cost data from any cloud provider
   * @param {Object} rawData - Raw cost data from cloud provider
   * @param {string} provider - Provider name (aws, azure, gcp)
   * @returns {Object} Normalized cost data
   */
  static normalizeCostData(rawData, provider) {
    try {
      const normalized = {
        provider: provider.toLowerCase(),
        totalCost: 0,
        currency: 'USD',
        period: {
          start: null,
          end: null
        },
        services: [],
        metadata: {
          normalizedAt: new Date().toISOString(),
          originalProvider: provider
        }
      };

      switch (provider.toLowerCase()) {
        case 'aws':
          return this.normalizeAWSData(rawData, normalized);
        case 'azure':
          return this.normalizeAzureData(rawData, normalized);
        case 'gcp':
          return this.normalizeGCPData(rawData, normalized);
        default:
          logger.warn(`Unknown provider for normalization: ${provider}`);
          return normalized;
      }

    } catch (error) {
      logger.error(`Error normalizing cost data for ${provider}:`, error);
      return this.getEmptyNormalizedData(provider);
    }
  }

  /**
   * Normalize AWS cost data
   * @param {Object} rawData - Raw AWS cost data
   * @param {Object} normalized - Base normalized structure
   * @returns {Object} Normalized AWS data
   */
  static normalizeAWSData(rawData, normalized) {
    normalized.totalCost = rawData.totalCost || 0;
    normalized.currency = rawData.currency || 'USD';
    normalized.period = rawData.period || { start: null, end: null };

    // Normalize services data
    if (rawData.services && Array.isArray(rawData.services)) {
      normalized.services = rawData.services.map(service => ({
        name: this.normalizeServiceName(service.name || service.serviceName, 'aws'),
        cost: service.cost || 0,
        currency: service.currency || normalized.currency,
        provider: 'aws',
        originalName: service.name || service.serviceName
      }));
    }

    return normalized;
  }

  /**
   * Normalize Azure cost data
   * @param {Object} rawData - Raw Azure cost data
   * @param {Object} normalized - Base normalized structure
   * @returns {Object} Normalized Azure data
   */
  static normalizeAzureData(rawData, normalized) {
    normalized.totalCost = rawData.totalCost || 0;
    normalized.currency = rawData.currency || 'USD';
    normalized.period = rawData.period || { start: null, end: null };

    // Normalize services data
    if (rawData.services && Array.isArray(rawData.services)) {
      normalized.services = rawData.services.map(service => ({
        name: this.normalizeServiceName(service.name || service.serviceName, 'azure'),
        cost: service.cost || 0,
        currency: service.currency || normalized.currency,
        provider: 'azure',
        originalName: service.name || service.serviceName
      }));
    }

    return normalized;
  }

  /**
   * Normalize GCP cost data
   * @param {Object} rawData - Raw GCP cost data
   * @param {Object} normalized - Base normalized structure
   * @returns {Object} Normalized GCP data
   */
  static normalizeGCPData(rawData, normalized) {
    normalized.totalCost = rawData.totalCost || 0;
    normalized.currency = rawData.currency || 'USD';
    normalized.period = rawData.period || { start: null, end: null };

    // Normalize services data
    if (rawData.services && Array.isArray(rawData.services)) {
      normalized.services = rawData.services.map(service => ({
        name: this.normalizeServiceName(service.name || service.serviceName, 'gcp'),
        cost: service.cost || 0,
        currency: service.currency || normalized.currency,
        provider: 'gcp',
        originalName: service.name || service.serviceName
      }));
    }

    return normalized;
  }

  /**
   * Normalize service names across providers for better comparison
   * @param {string} serviceName - Original service name
   * @param {string} provider - Cloud provider
   * @returns {string} Normalized service name
   */
  static normalizeServiceName(serviceName, provider) {
    if (!serviceName) return 'Unknown Service';

    const serviceMap = {
      // Compute services
      'Amazon Elastic Compute Cloud - Compute': 'Compute',
      'Amazon EC2-Instance': 'Compute',
      'Virtual Machines': 'Compute',
      'App Service': 'Compute',
      'Compute Engine': 'Compute',
      'Google Compute Engine': 'Compute',

      // Storage services
      'Amazon Simple Storage Service': 'Storage',
      'Amazon S3': 'Storage',
      'Storage': 'Storage',
      'Cloud Storage': 'Storage',
      'Google Cloud Storage': 'Storage',

      // Database services
      'Amazon Relational Database Service': 'Database',
      'Amazon RDS': 'Database',
      'Azure Database': 'Database',
      'SQL Database': 'Database',
      'Cloud SQL': 'Database',
      'Google Cloud SQL': 'Database',

      // Networking services
      'Amazon CloudFront': 'CDN',
      'Content Delivery Network': 'CDN',
      'Cloud CDN': 'CDN',
      'Amazon Virtual Private Cloud': 'Networking',
      'Virtual Network': 'Networking',
      'VPC Network': 'Networking',

      // Analytics/Big Data
      'Amazon Redshift': 'Analytics',
      'Azure Synapse Analytics': 'Analytics',
      'BigQuery': 'Analytics',
      'Google BigQuery': 'Analytics',

      // Container services
      'Amazon Elastic Container Service': 'Containers',
      'Amazon ECS': 'Containers',
      'Container Instances': 'Containers',
      'Google Kubernetes Engine': 'Containers',
      'Cloud Run': 'Containers',

      // Serverless/Functions
      'AWS Lambda': 'Serverless',
      'Azure Functions': 'Serverless',
      'Cloud Functions': 'Serverless',
      'Google Cloud Functions': 'Serverless'
    };

    // Try exact match first
    if (serviceMap[serviceName]) {
      return serviceMap[serviceName];
    }

    // Try partial matches
    const lowerServiceName = serviceName.toLowerCase();
    for (const [key, value] of Object.entries(serviceMap)) {
      if (lowerServiceName.includes(key.toLowerCase()) || 
          key.toLowerCase().includes(lowerServiceName)) {
        return value;
      }
    }

    // Clean up the service name by removing provider prefixes
    let cleanName = serviceName
      .replace(/^Amazon\s+/i, '')
      .replace(/^AWS\s+/i, '')
      .replace(/^Azure\s+/i, '')
      .replace(/^Google\s+/i, '')
      .replace(/^Cloud\s+/i, '')
      .trim();

    // Capitalize first letter
    cleanName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

    return cleanName || 'Unknown Service';
  }

  /**
   * Normalize cost trends data across providers
   * @param {Object} rawTrends - Raw trends data
   * @param {string} provider - Provider name
   * @returns {Object} Normalized trends data
   */
  static normalizeTrendsData(rawTrends, provider) {
    try {
      const normalized = {
        provider: provider.toLowerCase(),
        totalCost: rawTrends.totalCost || 0,
        currency: rawTrends.currency || 'USD',
        trends: [],
        metadata: {
          normalizedAt: new Date().toISOString(),
          originalProvider: provider
        }
      };

      if (rawTrends.trends && Array.isArray(rawTrends.trends)) {
        normalized.trends = rawTrends.trends.map(trend => ({
          date: trend.date,
          cost: trend.cost || 0,
          currency: trend.currency || normalized.currency,
          provider: provider.toLowerCase()
        })).sort((a, b) => new Date(a.date) - new Date(b.date));
      }

      return normalized;

    } catch (error) {
      logger.error(`Error normalizing trends data for ${provider}:`, error);
      return {
        provider: provider.toLowerCase(),
        totalCost: 0,
        currency: 'USD',
        trends: [],
        metadata: {
          normalizedAt: new Date().toISOString(),
          originalProvider: provider,
          error: error.message
        }
      };
    }
  }

  /**
   * Combine normalized data from multiple providers
   * @param {Array} normalizedDataArray - Array of normalized cost data from different providers
   * @returns {Object} Combined multi-cloud cost data
   */
  static combineMultiCloudData(normalizedDataArray) {
    try {
      const combined = {
        totalCost: 0,
        currency: 'USD',
        providers: {},
        combinedServices: [],
        metadata: {
          combinedAt: new Date().toISOString(),
          providersIncluded: []
        }
      };

      const serviceMap = new Map();

      normalizedDataArray.forEach(data => {
        if (!data || !data.provider) return;

        // Add to total cost
        combined.totalCost += data.totalCost || 0;
        
        // Store provider-specific data
        combined.providers[data.provider] = {
          totalCost: data.totalCost || 0,
          currency: data.currency || 'USD',
          serviceCount: (data.services || []).length
        };

        // Track providers included
        combined.metadata.providersIncluded.push(data.provider);

        // Combine services by normalized name
        if (data.services && Array.isArray(data.services)) {
          data.services.forEach(service => {
            const normalizedName = service.name;
            
            if (serviceMap.has(normalizedName)) {
              const existing = serviceMap.get(normalizedName);
              existing.totalCost += service.cost || 0;
              existing.providers.push({
                provider: service.provider,
                cost: service.cost || 0,
                originalName: service.originalName
              });
            } else {
              serviceMap.set(normalizedName, {
                name: normalizedName,
                totalCost: service.cost || 0,
                currency: service.currency || 'USD',
                providers: [{
                  provider: service.provider,
                  cost: service.cost || 0,
                  originalName: service.originalName
                }]
              });
            }
          });
        }
      });

      // Convert service map to array and sort by total cost
      combined.combinedServices = Array.from(serviceMap.values())
        .sort((a, b) => b.totalCost - a.totalCost);

      return combined;

    } catch (error) {
      logger.error('Error combining multi-cloud data:', error);
      return {
        totalCost: 0,
        currency: 'USD',
        providers: {},
        combinedServices: [],
        metadata: {
          combinedAt: new Date().toISOString(),
          providersIncluded: [],
          error: error.message
        }
      };
    }
  }

  /**
   * Get empty normalized data structure
   * @param {string} provider - Provider name
   * @returns {Object} Empty normalized structure
   */
  static getEmptyNormalizedData(provider) {
    return {
      provider: provider.toLowerCase(),
      totalCost: 0,
      currency: 'USD',
      period: { start: null, end: null },
      services: [],
      metadata: {
        normalizedAt: new Date().toISOString(),
        originalProvider: provider,
        isEmpty: true
      }
    };
  }

  /**
   * Validate normalized data structure
   * @param {Object} data - Normalized data to validate
   * @returns {boolean} Whether data is valid
   */
  static validateNormalizedData(data) {
    if (!data || typeof data !== 'object') return false;
    
    const requiredFields = ['provider', 'totalCost', 'currency', 'services'];
    return requiredFields.every(field => data.hasOwnProperty(field));
  }
}

module.exports = CostNormalizer;