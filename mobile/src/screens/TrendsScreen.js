import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Dimensions } from 'react-native';
import { Card, Text, Chip, useTheme, Snackbar, SegmentedButtons } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { LineChart } from 'react-native-chart-kit';
import apiService from '../services/apiService';

const screenWidth = Dimensions.get('window').width;

/**
 * Trends Screen
 * Cost trends and analytics across cloud providers
 */
const TrendsScreen = ({ navigation }) => {
  const theme = useTheme();
  const [trendsData, setTrendsData] = useState({});
  const [selectedProvider, setSelectedProvider] = useState('all');
  const [selectedPeriod, setSelectedPeriod] = useState('30d');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  // Mock trends data for demonstration
  const mockTrendsData = {
    aws: {
      trends: [
        { date: '2025-01-01', cost: 120 },
        { date: '2025-01-02', cost: 135 },
        { date: '2025-01-03', cost: 110 },
        { date: '2025-01-04', cost: 145 },
        { date: '2025-01-05', cost: 160 },
        { date: '2025-01-06', cost: 140 },
        { date: '2025-01-07', cost: 155 }
      ],
      totalCost: 965,
      currency: 'USD'
    },
    azure: {
      trends: [
        { date: '2025-01-01', cost: 85 },
        { date: '2025-01-02', cost: 92 },
        { date: '2025-01-03', cost: 78 },
        { date: '2025-01-04', cost: 105 },
        { date: '2025-01-05', cost: 118 },
        { date: '2025-01-06', cost: 95 },
        { date: '2025-01-07', cost: 102 }
      ],
      totalCost: 675,
      currency: 'USD'
    },
    gcp: {
      trends: [
        { date: '2025-01-01', cost: 65 },
        { date: '2025-01-02', cost: 72 },
        { date: '2025-01-03', cost: 58 },
        { date: '2025-01-04', cost: 80 },
        { date: '2025-01-05', cost: 88 },
        { date: '2025-01-06', cost: 75 },
        { date: '2025-01-07', cost: 82 }
      ],
      totalCost: 520,
      currency: 'USD'
    }
  };

  // Fetch trends data
  const fetchTrendsData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // For demo purposes, use mock data
      // In production, you would fetch from the API based on selectedPeriod
      setTrendsData(mockTrendsData);

    } catch (err) {
      console.error('Trends fetch error:', err);
      setError(err.message || 'Failed to fetch trends data');
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    fetchTrendsData();
  }, [selectedPeriod]);

  // Handle refresh
  const onRefresh = () => {
    fetchTrendsData(true);
  };

  // Prepare chart data based on selected provider
  const getChartData = () => {
    if (!trendsData || Object.keys(trendsData).length === 0) {
      return null;
    }

    let datasets = [];
    let labels = [];

    if (selectedProvider === 'all') {
      // Combined view
      const providers = ['aws', 'azure', 'gcp'];
      const colors = [theme.colors.aws, theme.colors.azure, theme.colors.gcp];
      
      providers.forEach((provider, index) => {
        if (trendsData[provider]) {
          datasets.push({
            data: trendsData[provider].trends.map(t => t.cost),
            color: (opacity = 1) => colors[index],
            strokeWidth: 2
          });
        }
      });
      
      // Use AWS dates as labels (assuming all providers have same dates)
      if (trendsData.aws) {
        labels = trendsData.aws.trends.map(t => 
          new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        );
      }
    } else {
      // Single provider view
      if (trendsData[selectedProvider]) {
        datasets.push({
          data: trendsData[selectedProvider].trends.map(t => t.cost),
          color: (opacity = 1) => getProviderColor(selectedProvider),
          strokeWidth: 3
        });
        
        labels = trendsData[selectedProvider].trends.map(t => 
          new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        );
      }
    }

    return {
      labels,
      datasets,
      legend: selectedProvider === 'all' ? ['AWS', 'Azure', 'GCP'] : [selectedProvider.toUpperCase()]
    };
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

  // Format currency
  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  // Calculate trend statistics
  const getTrendStats = () => {
    if (!trendsData || Object.keys(trendsData).length === 0) {
      return null;
    }

    const stats = {
      totalCost: 0,
      highestDay: { cost: 0, date: '', provider: '' },
      lowestDay: { cost: Infinity, date: '', provider: '' },
      avgDaily: 0
    };

    let totalDays = 0;

    Object.entries(trendsData).forEach(([provider, data]) => {
      stats.totalCost += data.totalCost || 0;
      
      data.trends.forEach(trend => {
        totalDays++;
        
        if (trend.cost > stats.highestDay.cost) {
          stats.highestDay = {
            cost: trend.cost,
            date: trend.date,
            provider
          };
        }
        
        if (trend.cost < stats.lowestDay.cost) {
          stats.lowestDay = {
            cost: trend.cost,
            date: trend.date,
            provider
          };
        }
      });
    });

    stats.avgDaily = totalDays > 0 ? stats.totalCost / totalDays : 0;

    return stats;
  };

  const chartData = getChartData();
  const trendStats = getTrendStats();

  // Loading state
  if (loading && Object.keys(trendsData).length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text variant="bodyLarge">Loading trends...</Text>
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
        {/* Controls */}
        <Card style={styles.controlsCard}>
          <Card.Content>
            <Text variant="titleSmall" style={styles.controlLabel}>
              Cloud Provider
            </Text>
            <SegmentedButtons
              value={selectedProvider}
              onValueChange={setSelectedProvider}
              buttons={[
                { value: 'all', label: 'All' },
                { value: 'aws', label: 'AWS' },
                { value: 'azure', label: 'Azure' },
                { value: 'gcp', label: 'GCP' }
              ]}
              style={styles.segmentedButtons}
            />
            
            <Text variant="titleSmall" style={[styles.controlLabel, { marginTop: 16 }]}>
              Time Period
            </Text>
            <SegmentedButtons
              value={selectedPeriod}
              onValueChange={setSelectedPeriod}
              buttons={[
                { value: '7d', label: '7 Days' },
                { value: '30d', label: '30 Days' },
                { value: '90d', label: '90 Days' }
              ]}
              style={styles.segmentedButtons}
            />
          </Card.Content>
        </Card>

        {/* Chart */}
        {chartData && (
          <Card style={styles.chartCard}>
            <Card.Content>
              <View style={styles.chartHeader}>
                <Icon 
                  name="chart-line" 
                  size={24} 
                  color={theme.colors.primary} 
                />
                <Text variant="titleMedium" style={styles.chartTitle}>
                  Cost Trends - {selectedProvider === 'all' ? 'All Providers' : selectedProvider.toUpperCase()}
                </Text>
              </View>
              
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <LineChart
                  data={chartData}
                  width={Math.max(screenWidth - 60, chartData.labels.length * 60)}
                  height={220}
                  chartConfig={{
                    backgroundColor: theme.colors.surface,
                    backgroundGradientFrom: theme.colors.surface,
                    backgroundGradientTo: theme.colors.surface,
                    decimalPlaces: 0,
                    color: (opacity = 1) => theme.colors.primary,
                    labelColor: (opacity = 1) => theme.colors.onSurface,
                    style: {
                      borderRadius: 16
                    },
                    propsForDots: {
                      r: '4',
                      strokeWidth: '2'
                    }
                  }}
                  bezier
                  style={styles.chart}
                />
              </ScrollView>
            </Card.Content>
          </Card>
        )}

        {/* Statistics */}
        {trendStats && (
          <Card style={styles.statsCard}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.statsTitle}>
                Trend Statistics
              </Text>
              
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text variant="headlineSmall" style={styles.statValue}>
                    {formatCurrency(trendStats.totalCost)}
                  </Text>
                  <Text variant="bodySmall" style={styles.statLabel}>
                    Total Cost
                  </Text>
                </View>
                
                <View style={styles.statItem}>
                  <Text variant="headlineSmall" style={styles.statValue}>
                    {formatCurrency(trendStats.avgDaily)}
                  </Text>
                  <Text variant="bodySmall" style={styles.statLabel}>
                    Daily Average
                  </Text>
                </View>
              </View>

              <View style={styles.extremesSection}>
                <View style={styles.extremeItem}>
                  <View style={styles.extremeHeader}>
                    <Icon name="trending-up" size={20} color={theme.colors.error} />
                    <Text variant="titleSmall" style={styles.extremeTitle}>
                      Highest Day
                    </Text>
                  </View>
                  <Text variant="bodyMedium" style={styles.extremeValue}>
                    {formatCurrency(trendStats.highestDay.cost)} on {new Date(trendStats.highestDay.date).toLocaleDateString()}
                  </Text>
                  <Chip mode="outlined" compact>
                    {trendStats.highestDay.provider.toUpperCase()}
                  </Chip>
                </View>

                <View style={styles.extremeItem}>
                  <View style={styles.extremeHeader}>
                    <Icon name="trending-down" size={20} color={theme.colors.success} />
                    <Text variant="titleSmall" style={styles.extremeTitle}>
                      Lowest Day
                    </Text>
                  </View>
                  <Text variant="bodyMedium" style={styles.extremeValue}>
                    {formatCurrency(trendStats.lowestDay.cost)} on {new Date(trendStats.lowestDay.date).toLocaleDateString()}
                  </Text>
                  <Chip mode="outlined" compact>
                    {trendStats.lowestDay.provider.toUpperCase()}
                  </Chip>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Provider Breakdown */}
        {selectedProvider === 'all' && (
          <Card style={styles.breakdownCard}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.breakdownTitle}>
                Provider Breakdown
              </Text>
              
              {Object.entries(trendsData).map(([provider, data]) => (
                <View key={provider} style={styles.breakdownItem}>
                  <View style={styles.breakdownHeader}>
                    <Icon 
                      name="circle" 
                      size={12} 
                      color={getProviderColor(provider)} 
                    />
                    <Text variant="bodyMedium" style={styles.breakdownProvider}>
                      {provider.toUpperCase()}
                    </Text>
                  </View>
                  <Text variant="bodyMedium" style={styles.breakdownCost}>
                    {formatCurrency(data.totalCost, data.currency)}
                  </Text>
                </View>
              ))}
            </Card.Content>
          </Card>
        )}
      </ScrollView>

      {/* Error Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        action={{
          label: 'Retry',
          onPress: () => fetchTrendsData(),
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
  controlsCard: {
    margin: 16,
    elevation: 2
  },
  controlLabel: {
    fontWeight: 'bold',
    marginBottom: 8
  },
  segmentedButtons: {
    marginBottom: 8
  },
  chartCard: {
    margin: 16,
    elevation: 4
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  chartTitle: {
    marginLeft: 12,
    fontWeight: 'bold'
  },
  chart: {
    marginVertical: 8,
    borderRadius: 16
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
    justifyContent: 'space-around',
    marginBottom: 16
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
  },
  extremesSection: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 16,
    gap: 16
  },
  extremeItem: {
    gap: 8
  },
  extremeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  extremeTitle: {
    fontWeight: 'bold'
  },
  extremeValue: {
    marginLeft: 28
  },
  breakdownCard: {
    margin: 16,
    elevation: 2
  },
  breakdownTitle: {
    fontWeight: 'bold',
    marginBottom: 16
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  breakdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  breakdownProvider: {
    fontWeight: '500'
  },
  breakdownCost: {
    fontWeight: 'bold'
  }
});

export default TrendsScreen;