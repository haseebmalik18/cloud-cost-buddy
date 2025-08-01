import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { Card, Text, Chip, FAB, useTheme, Snackbar } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import CloudCard from '../components/CloudCard';
import apiService from '../services/apiService';

/**
 * Main dashboard showing multi-cloud cost summary
 */
const DashboardScreen = ({ navigation }) => {
  const theme = useTheme();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);

  const fetchDashboardData = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response = await apiService.dashboard.getSummary();
      setDashboardData(response.data.data);

    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError(err.message || 'Failed to fetch dashboard data');
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onRefresh = () => {
    fetchDashboardData(true);
  };

  const handleCloudCardPress = (provider) => {
    navigation.navigate('Clouds', { 
      screen: 'CloudDetail', 
      params: { provider } 
    });
  };

  const formatCurrency = (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  if (loading && !dashboardData) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text variant="bodyLarge">Loading dashboard...</Text>
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
        {/* Total Cost Summary */}
        <Card style={styles.summaryCard}>
          <Card.Content>
            <View style={styles.summaryHeader}>
              <Icon 
                name="credit-card-multiple" 
                size={28} 
                color={theme.colors.primary} 
              />
              <Text variant="titleMedium" style={styles.summaryTitle}>
                Total Multi-Cloud Spend
              </Text>
            </View>
            <Text variant="displaySmall" style={styles.totalAmount}>
              {formatCurrency(dashboardData?.totalCost, dashboardData?.currency)}
            </Text>
            <Text variant="bodyMedium" style={styles.summarySubtitle}>
              Current month across all clouds
            </Text>
            
            {dashboardData?.lastUpdated && (
              <Text variant="bodySmall" style={styles.lastUpdated}>
                Last updated: {new Date(dashboardData.lastUpdated).toLocaleString()}
              </Text>
            )}
          </Card.Content>
        </Card>

        {/* Cloud Provider Cards */}
        <View style={styles.cloudSection}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Cloud Providers
          </Text>
          
          {dashboardData?.clouds && Object.entries(dashboardData.clouds).map(([provider, data]) => (
            <CloudCard
              key={provider}
              provider={provider}
              data={data}
              onPress={() => handleCloudCardPress(provider)}
            />
          ))}
        </View>

        {/* Combined Services Overview */}
        {dashboardData?.combinedServices && dashboardData.combinedServices.length > 0 && (
          <Card style={styles.servicesCard}>
            <Card.Content>
              <View style={styles.servicesHeader}>
                <Icon 
                  name="server" 
                  size={24} 
                  color={theme.colors.primary} 
                />
                <Text variant="titleMedium" style={styles.servicesTitle}>
                  Top Services Across All Clouds
                </Text>
              </View>
              
              {dashboardData.combinedServices.slice(0, 5).map((service, index) => (
                <View key={index} style={styles.serviceRow}>
                  <View style={styles.serviceInfo}>
                    <Text variant="bodyMedium" style={styles.serviceName}>
                      {service.name}
                    </Text>
                    <View style={styles.providerChips}>
                      {service.providers.map((provider, pIndex) => (
                        <Chip
                          key={pIndex}
                          mode="outlined"
                          compact
                          style={styles.providerChip}
                          textStyle={styles.providerChipText}
                        >
                          {provider.provider.toUpperCase()}
                        </Chip>
                      ))}
                    </View>
                  </View>
                  <Text variant="bodyMedium" style={styles.serviceTotalCost}>
                    {formatCurrency(service.totalCost, service.currency)}
                  </Text>
                </View>
              ))}
            </Card.Content>
          </Card>
        )}

        {/* Quick Actions */}
        <Card style={styles.actionsCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.actionsTitle}>
              Quick Actions
            </Text>
            <View style={styles.actionsGrid}>
              <Chip
                mode="outlined"
                icon="chart-line"
                onPress={() => navigation.navigate('Trends')}
                style={styles.actionChip}
              >
                View Trends
              </Chip>
              <Chip
                mode="outlined"
                icon="bell"
                onPress={() => navigation.navigate('Alerts')}
                style={styles.actionChip}
              >
                Manage Alerts
              </Chip>
              <Chip
                mode="outlined"
                icon="compare"
                onPress={() => navigation.navigate('Clouds')}
                style={styles.actionChip}
              >
                Compare Clouds
              </Chip>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Refresh FAB */}
      <FAB
        icon="refresh"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={onRefresh}
        loading={refreshing}
      />

      {/* Error Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        action={{
          label: 'Retry',
          onPress: () => fetchDashboardData(),
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
    paddingBottom: 100
  },
  summaryCard: {
    margin: 16,
    elevation: 4
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  summaryTitle: {
    marginLeft: 12,
    fontWeight: 'bold'
  },
  totalAmount: {
    fontWeight: 'bold',
    marginBottom: 8
  },
  summarySubtitle: {
    opacity: 0.7,
    marginBottom: 8
  },
  lastUpdated: {
    opacity: 0.6,
    fontStyle: 'italic'
  },
  cloudSection: {
    marginTop: 8
  },
  sectionTitle: {
    marginHorizontal: 16,
    marginVertical: 8,
    fontWeight: 'bold'
  },
  servicesCard: {
    margin: 16,
    elevation: 2
  },
  servicesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  servicesTitle: {
    marginLeft: 12,
    fontWeight: 'bold'
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0'
  },
  serviceInfo: {
    flex: 1
  },
  serviceName: {
    fontWeight: '500',
    marginBottom: 4
  },
  providerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap'
  },
  providerChip: {
    marginRight: 4,
    marginTop: 2,
    height: 24
  },
  providerChipText: {
    fontSize: 10
  },
  serviceTotalCost: {
    fontWeight: 'bold'
  },
  actionsCard: {
    margin: 16,
    elevation: 2
  },
  actionsTitle: {
    fontWeight: 'bold',
    marginBottom: 16
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  actionChip: {
    marginRight: 8,
    marginBottom: 8
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0
  }
});

export default DashboardScreen;