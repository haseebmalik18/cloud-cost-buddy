import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Text, Chip, ProgressBar, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

/**
 * CloudCard Component
 * Displays cost information for a single cloud provider
 */
const CloudCard = ({ 
  provider, 
  data, 
  onPress 
}) => {
  const theme = useTheme();

  // Get provider-specific styling
  const getProviderConfig = (providerName) => {
    switch (providerName?.toLowerCase()) {
      case 'aws':
        return {
          color: theme.colors.aws,
          icon: 'aws',
          name: 'AWS'
        };
      case 'azure':
        return {
          color: theme.colors.azure,
          icon: 'microsoft-azure',
          name: 'Azure'
        };
      case 'gcp':
        return {
          color: theme.colors.gcp,
          icon: 'google-cloud',
          name: 'Google Cloud'
        };
      default:
        return {
          color: theme.colors.primary,
          icon: 'cloud',
          name: provider
        };
    }
  };

  const config = getProviderConfig(provider);
  
  // Handle loading and error states
  if (!data) {
    return (
      <Card style={styles.card} onPress={onPress}>
        <Card.Content>
          <View style={styles.header}>
            <Icon name={config.icon} size={24} color={config.color} />
            <Text variant="titleMedium" style={styles.providerName}>
              {config.name}
            </Text>
            <Chip mode="outlined" compact>Loading...</Chip>
          </View>
        </Card.Content>
      </Card>
    );
  }

  if (data.status === 'error') {
    return (
      <Card style={styles.card} onPress={onPress}>
        <Card.Content>
          <View style={styles.header}>
            <Icon name={config.icon} size={24} color={theme.colors.error} />
            <Text variant="titleMedium" style={styles.providerName}>
              {config.name}
            </Text>
            <Chip mode="outlined" compact textStyle={{ color: theme.colors.error }}>
              Error
            </Chip>
          </View>
          <Text variant="bodySmall" style={[styles.errorText, { color: theme.colors.error }]}>
            {data.error || 'Connection failed'}
          </Text>
        </Card.Content>
      </Card>
    );
  }

  // Format currency values
  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  // Calculate budget utilization if forecast is available
  const budgetUtilization = data.forecast ? 
    Math.min((data.totalCost / data.forecast.forecastedCost) * 100, 100) : 
    null;

  return (
    <Card style={styles.card} onPress={onPress}>
      <Card.Content>
        <View style={styles.header}>
          <Icon name={config.icon} size={24} color={config.color} />
          <Text variant="titleMedium" style={styles.providerName}>
            {config.name}
          </Text>
          <Chip 
            mode="flat" 
            compact 
            style={{ backgroundColor: `${config.color}20` }}
            textStyle={{ color: config.color }}
          >
            Active
          </Chip>
        </View>

        <View style={styles.costSection}>
          <Text variant="headlineMedium" style={styles.totalCost}>
            {formatCurrency(data.totalCost, data.currency)}
          </Text>
          <Text variant="bodySmall" style={styles.costLabel}>
            This month
          </Text>
        </View>

        {budgetUtilization !== null && (
          <View style={styles.budgetSection}>
            <View style={styles.budgetHeader}>
              <Text variant="bodySmall">Budget utilization</Text>
              <Text variant="bodySmall" style={{ fontWeight: 'bold' }}>
                {budgetUtilization.toFixed(1)}%
              </Text>
            </View>
            <ProgressBar 
              progress={budgetUtilization / 100} 
              color={budgetUtilization > 80 ? theme.colors.warning : config.color}
              style={styles.progressBar}
            />
          </View>
        )}

        {data.topServices && data.topServices.length > 0 && (
          <View style={styles.servicesSection}>
            <Text variant="bodySmall" style={styles.servicesLabel}>
              Top services
            </Text>
            {data.topServices.slice(0, 3).map((service, index) => (
              <View key={index} style={styles.serviceItem}>
                <Text variant="bodySmall" style={styles.serviceName}>
                  {service.name || service.serviceName}
                </Text>
                <Text variant="bodySmall" style={styles.serviceCost}>
                  {formatCurrency(service.cost, service.currency)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {data.lastUpdated && (
          <Text variant="bodySmall" style={styles.lastUpdated}>
            Updated {new Date(data.lastUpdated).toLocaleTimeString()}
          </Text>
        )}
      </Card.Content>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: 8,
    marginHorizontal: 16,
    elevation: 2
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  providerName: {
    flex: 1,
    marginLeft: 12,
    fontWeight: 'bold'
  },
  costSection: {
    marginBottom: 16
  },
  totalCost: {
    fontWeight: 'bold',
    marginBottom: 4
  },
  costLabel: {
    opacity: 0.7
  },
  budgetSection: {
    marginBottom: 16
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  progressBar: {
    height: 6,
    borderRadius: 3
  },
  servicesSection: {
    marginBottom: 12
  },
  servicesLabel: {
    fontWeight: 'bold',
    marginBottom: 8,
    opacity: 0.8
  },
  serviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2
  },
  serviceName: {
    flex: 1
  },
  serviceCost: {
    fontWeight: '500'
  },
  lastUpdated: {
    opacity: 0.6,
    textAlign: 'right'
  },
  errorText: {
    marginTop: 8,
    fontStyle: 'italic'
  }
});

export default CloudCard;