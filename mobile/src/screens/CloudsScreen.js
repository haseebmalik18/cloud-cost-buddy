import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Card, Text, Chip, useTheme, Snackbar } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import CloudCard from '../components/CloudCard';
import apiService from '../services/apiService';

/**
 * Clouds Screen
 * Individual cloud provider details and comparison
 */
const CloudsScreen = ({ navigation }) => {
  const theme = useTheme();
  const [cloudsData, setCloudsData] = useState({});
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  // Fetch data for all cloud providers
  const fetchCloudsData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Fetch data from all providers in parallel
      const [dashboardResponse, comparisonResponse] = await Promise.all([
        apiService.dashboard.getSummary(),
        apiService.dashboard.getComparison().catch(() => null)
      ]);

      setCloudsData(dashboardResponse.data.data.clouds || {});
      if (comparisonResponse) {
        setComparison(comparisonResponse.data.data);
      }

    } catch (err) {
      console.error('Clouds fetch error:', err);
      setError(err.message || 'Failed to fetch cloud data');
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchCloudsData();
  }, []);

  // Handle refresh
  const onRefresh = () => {
    fetchCloudsData(true);
  };

  // Handle cloud card press - show provider details
  const handleCloudCardPress = (provider) => {
    // Navigate to provider-specific details view
    const providerData = cloudsData[provider];
    
    if (!providerData || providerData.status !== 'active') {
      console.log(`${provider} is not available or has errors`);
      return;
    }

    // In a full implementation, this would navigate to a detailed screen
    // For now, we'll show provider-specific information
    console.log(`${provider.toUpperCase()} Details:`, {
      totalCost: providerData.totalCost,
      currency: providerData.currency,
      serviceCount: providerData.topServices?.length || 0,
      lastUpdated: providerData.lastUpdated
    });
    
    // Future: navigation.navigate('ProviderDetail', { provider, data: providerData });
  };

  // Format currency
  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  // Get provider color
  const getProviderColor = (provider) => {
    switch (provider?.toLowerCase()) {
      case 'aws': return theme.colors.aws;
      case 'azure': return theme.colors.azure;
      case 'gcp': return theme.colors.gcp;
      default: return theme.colors.primary;
    }
  };

  // Loading state
  if (loading && Object.keys(cloudsData).length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text variant="bodyLarge">Loading cloud providers...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Cloud Provider Comparison */}
        {comparison && (
          <Card style={styles.comparisonCard}>
            <Card.Content>
              <View style={styles.comparisonHeader}>
                <Icon 
                  name="compare" 
                  size={24} 
                  color={theme.colors.primary} 
                />
                <Text variant="titleMedium" style={styles.comparisonTitle}>
                  Cost Comparison
                </Text>
              </View>
              
              <Text variant="bodyMedium" style={styles.totalCost}>
                Total: {formatCurrency(comparison.totalCost, 'USD')}
              </Text>

              {comparison.ranking && comparison.ranking.length > 0 && (
                <View style={styles.rankingSection}>
                  {comparison.ranking.map((item, index) => (
                    <View key={item.provider} style={styles.rankingItem}>
                      <View style={styles.rankingInfo}>
                        <Text variant="bodyMedium" style={styles.rankingProvider}>
                          #{index + 1} {item.provider.toUpperCase()}
                        </Text>
                        <Text variant="bodySmall" style={styles.rankingPercentage}>
                          {item.percentage.toFixed(1)}% of total
                        </Text>
                      </View>
                      <Text variant="bodyMedium" style={styles.rankingCost}>
                        {formatCurrency(item.totalCost)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </Card.Content>
          </Card>
        )}

        {/* Individual Cloud Provider Cards */}
        <View style={styles.cloudsSection}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Cloud Providers
          </Text>
          
          {Object.entries(cloudsData).map(([provider, data]) => (
            <CloudCard
              key={provider}
              provider={provider}
              data={data}
              onPress={() => handleCloudCardPress(provider)}
            />
          ))}
        </View>

        {/* Health Status Overview */}
        <Card style={styles.healthCard}>
          <Card.Content>
            <View style={styles.healthHeader}>
              <Icon 
                name="heart-pulse" 
                size={24} 
                color={theme.colors.success} 
              />
              <Text variant="titleMedium" style={styles.healthTitle}>
                Connection Status
              </Text>
            </View>
            
            <View style={styles.healthStatus}>
              {Object.entries(cloudsData).map(([provider, data]) => (
                <View key={provider} style={styles.healthItem}>
                  <Icon 
                    name="circle" 
                    size={12} 
                    color={
                      data.status === 'active' ? theme.colors.success :
                      data.status === 'error' ? theme.colors.error :
                      theme.colors.warning
                    } 
                  />
                  <Text variant="bodyMedium" style={styles.healthProvider}>
                    {provider.toUpperCase()}
                  </Text>
                  <Chip
                    mode="outlined"
                    compact
                    textStyle={{
                      color: data.status === 'active' ? theme.colors.success :
                             data.status === 'error' ? theme.colors.error :
                             theme.colors.warning
                    }}
                  >
                    {data.status || 'Unknown'}
                  </Chip>
                </View>
              ))}
            </View>
          </Card.Content>
        </Card>

        {/* Quick Stats */}
        <Card style={styles.statsCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.statsTitle}>
              Quick Statistics
            </Text>
            
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text variant="headlineSmall" style={styles.statValue}>
                  {Object.keys(cloudsData).length}
                </Text>
                <Text variant="bodySmall" style={styles.statLabel}>
                  Providers
                </Text>
              </View>
              
              <View style={styles.statItem}>
                <Text variant="headlineSmall" style={styles.statValue}>
                  {Object.values(cloudsData).filter(d => d.status === 'active').length}
                </Text>
                <Text variant="bodySmall" style={styles.statLabel}>
                  Active
                </Text>
              </View>
              
              <View style={styles.statItem}>
                <Text variant="headlineSmall" style={styles.statValue}>
                  {Object.values(cloudsData)
                    .filter(d => d.topServices)
                    .reduce((sum, d) => sum + (d.topServices?.length || 0), 0)
                  }
                </Text>
                <Text variant="bodySmall" style={styles.statLabel}>
                  Services
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Error Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        action={{
          label: 'Retry',
          onPress: () => fetchCloudsData(),
        }}
      >
        {error}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center'
  },
  scrollContent: {
    paddingBottom: 20
  },
  comparisonCard: {
    margin: 16,
    elevation: 4
  },
  comparisonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  comparisonTitle: {
    marginLeft: 12,
    fontWeight: 'bold'
  },
  totalCost: {
    fontWeight: 'bold',
    marginBottom: 16
  },
  rankingSection: {
    marginTop: 8
  },
  rankingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  rankingInfo: {
    flex: 1
  },
  rankingProvider: {
    fontWeight: '500'
  },
  rankingPercentage: {
    opacity: 0.7,
    marginTop: 2
  },
  rankingCost: {
    fontWeight: 'bold'
  },
  cloudsSection: {
    marginTop: 8
  },
  sectionTitle: {
    marginHorizontal: 16,
    marginVertical: 8,
    fontWeight: 'bold'
  },
  healthCard: {
    margin: 16,
    elevation: 2
  },
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  healthTitle: {
    marginLeft: 12,
    fontWeight: 'bold'
  },
  healthStatus: {
    gap: 12
  },
  healthItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  healthProvider: {
    flex: 1,
    marginLeft: 12,
    fontWeight: '500'
  },
  statsCard: {
    margin: 16,
    elevation: 2
  },
  statsTitle: {
    fontWeight: 'bold',
    marginBottom: 16
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  statItem: {
    alignItems: 'center'
  },
  statValue: {
    fontWeight: 'bold',
    marginBottom: 4
  },
  statLabel: {
    opacity: 0.7
  }
});

export default CloudsScreen;