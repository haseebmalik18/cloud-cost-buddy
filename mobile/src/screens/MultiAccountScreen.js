import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Alert
} from 'react-native';
import {
  Card,
  Text,
  Button,
  FAB,
  Chip,
  useTheme,
  Snackbar,
  Badge,
  IconButton,
  Menu,
  Divider
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import apiService from '../services/apiService';

const MultiAccountScreen = ({ navigation }) => {
  const theme = useTheme();
  const [accounts, setAccounts] = useState({
    aws: [],
    azure: [],
    gcp: []
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [menuVisible, setMenuVisible] = useState({});

  const cloudProviders = {
    aws: {
      name: 'AWS',
      icon: 'aws',
      color: '#FF9900',
      accountType: 'Account'
    },
    azure: {
      name: 'Azure',
      icon: 'microsoft-azure',
      color: '#0078D4',
      accountType: 'Subscription'
    },
    gcp: {
      name: 'GCP',
      icon: 'google-cloud',
      color: '#4285F4',
      accountType: 'Project'
    }
  };

  const fetchAccounts = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const [awsResponse, azureResponse, gcpResponse] = await Promise.allSettled([
        apiService.aws.getAccounts(),
        apiService.azure.getSubscriptions(),
        apiService.gcp.getProjects()
      ]);

      const newAccounts = {
        aws: awsResponse.status === 'fulfilled' ? awsResponse.value.data.accounts : [],
        azure: azureResponse.status === 'fulfilled' ? azureResponse.value.data.subscriptions : [],
        gcp: gcpResponse.status === 'fulfilled' ? gcpResponse.value.data.projects : []
      };

      setAccounts(newAccounts);

    } catch (err) {
      // console.error('Multi-account fetch error:', err);
      setError(err.message || 'Failed to fetch accounts');
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const onRefresh = () => {
    fetchAccounts(true);
  };

  const handleAddAccount = (provider) => {
    navigation.navigate('ConnectCloud', { provider });
  };

  const testConnection = async (provider, accountId) => {
    try {
      let response;
      switch (provider) {
        case 'aws':
          response = await apiService.aws.testConnection(accountId);
          break;
        case 'azure':
          response = await apiService.azure.testConnection(accountId);
          break;
        case 'gcp':
          response = await apiService.gcp.testConnection(accountId);
          break;
      }

      if (response.data.connectionTest.success) {
        Alert.alert('Connection Successful', 'Account connection is working properly.');
      } else {
        Alert.alert('Connection Failed', response.data.connectionTest.message);
      }
    } catch (error) {
      Alert.alert('Connection Test Failed', error.message);
    }
  };

  const removeAccount = async (provider, accountId, accountName) => {
    Alert.alert(
      'Remove Account',
      `Are you sure you want to remove ${accountName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.accounts.removeAccount(accountId);
              fetchAccounts();
            } catch (error) {
              Alert.alert('Error', 'Failed to remove account');
            }
          }
        }
      ]
    );
  };

  const toggleMenu = (accountId) => {
    setMenuVisible(prev => ({
      ...prev,
      [accountId]: !prev[accountId]
    }));
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return '#4CAF50';
      case 'pending': return '#FF9800';
      case 'syncing': return '#2196F3';
      case 'error': return '#F44336';
      default: return '#9E9E9E';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return 'check-circle';
      case 'pending': return 'clock';
      case 'syncing': return 'sync';
      case 'error': return 'alert-circle';
      default: return 'help-circle';
    }
  };

  const formatLastSync = (lastSync) => {
    if (!lastSync) return 'Never';
    const date = new Date(lastSync);
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
    return date.toLocaleDateString();
  };

  const renderAccountCard = (account, provider) => {
    const providerInfo = cloudProviders[provider];
    
    return (
      <Card key={account.id} style={styles.accountCard}>
        <Card.Content>
          <View style={styles.accountHeader}>
            <View style={styles.accountInfo}>
              <View style={styles.accountTitleRow}>
                <Icon 
                  name={providerInfo.icon} 
                  size={24} 
                  color={providerInfo.color} 
                />
                <Text variant="titleMedium" style={styles.accountName}>
                  {account.account_name}
                </Text>
                <Badge 
                  style={[
                    styles.statusBadge, 
                    { backgroundColor: getStatusColor(account.connectionStatus) }
                  ]}
                  size={8}
                />
              </View>
              <Text variant="bodySmall" style={styles.accountId}>
                {providerInfo.accountType} ID: {account.account_id}
              </Text>
              <View style={styles.statusRow}>
                <Icon 
                  name={getStatusIcon(account.connectionStatus)} 
                  size={16} 
                  color={getStatusColor(account.connectionStatus)} 
                />
                <Text 
                  variant="bodySmall" 
                  style={[
                    styles.statusText, 
                    { color: getStatusColor(account.connectionStatus) }
                  ]}
                >
                  {account.connectionStatus.charAt(0).toUpperCase() + account.connectionStatus.slice(1)}
                </Text>
                <Text variant="bodySmall" style={styles.lastSync}>
                  • Last sync: {formatLastSync(account.lastSyncTime)}
                </Text>
              </View>
            </View>
            
            <Menu
              visible={menuVisible[account.id] || false}
              onDismiss={() => toggleMenu(account.id)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  size={20}
                  onPress={() => toggleMenu(account.id)}
                />
              }
            >
              <Menu.Item
                onPress={() => {
                  toggleMenu(account.id);
                  testConnection(provider, account.account_id);
                }}
                title="Test Connection"
                leadingIcon="wifi"
              />
              <Menu.Item
                onPress={() => {
                  toggleMenu(account.id);
                  navigation.navigate('CloudDetail', { 
                    provider, 
                    accountId: account.account_id,
                    accountName: account.account_name
                  });
                }}
                title="View Details"
                leadingIcon="chart-line"
              />
              <Divider />
              <Menu.Item
                onPress={() => {
                  toggleMenu(account.id);
                  removeAccount(provider, account.id, account.account_name);
                }}
                title="Remove Account"
                leadingIcon="delete"
                titleStyle={{ color: theme.colors.error }}
              />
            </Menu>
          </View>
          
          {account.error_message && (
            <View style={styles.errorContainer}>
              <Icon name="alert" size={16} color={theme.colors.error} />
              <Text variant="bodySmall" style={[styles.errorText, { color: theme.colors.error }]}>
                {account.error_message}
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  const renderProviderSection = (provider) => {
    const providerInfo = cloudProviders[provider];
    const providerAccounts = accounts[provider] || [];
    
    return (
      <View key={provider} style={styles.providerSection}>
        <View style={styles.providerHeader}>
          <View style={styles.providerTitleRow}>
            <Icon 
              name={providerInfo.icon} 
              size={28} 
              color={providerInfo.color} 
            />
            <Text variant="headlineSmall" style={styles.providerTitle}>
              {providerInfo.name}
            </Text>
            <Chip
              mode="outlined"
              compact
              style={styles.countChip}
            >
              {providerAccounts.length} {providerAccounts.length === 1 ? providerInfo.accountType.toLowerCase() : providerInfo.accountType.toLowerCase() + 's'}
            </Chip>
          </View>
          
          <Button
            mode="outlined"
            icon="plus"
            onPress={() => handleAddAccount(provider)}
            style={styles.addButton}
            compact
          >
            Add {providerInfo.accountType}
          </Button>
        </View>
        
        {providerAccounts.length > 0 ? (
          <View style={styles.accountsList}>
            {providerAccounts.map(account => renderAccountCard(account, provider))}
          </View>
        ) : (
          <Card style={styles.emptyCard}>
            <Card.Content>
              <View style={styles.emptyState}>
                <Icon 
                  name={providerInfo.icon} 
                  size={48} 
                  color={theme.colors.outline} 
                />
                <Text variant="bodyLarge" style={styles.emptyText}>
                  No {providerInfo.name} {providerInfo.accountType.toLowerCase()}s connected
                </Text>
                <Text variant="bodySmall" style={styles.emptySubtext}>
                  Add your first {providerInfo.accountType.toLowerCase()} to start monitoring costs
                </Text>
                <Button
                  mode="contained"
                  icon="plus"
                  onPress={() => handleAddAccount(provider)}
                  style={styles.emptyButton}
                >
                  Connect {providerInfo.accountType}
                </Button>
              </View>
            </Card.Content>
          </Card>
        )}
      </View>
    );
  };

  if (loading && Object.keys(accounts).every(key => accounts[key].length === 0)) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text variant="bodyLarge">Loading accounts...</Text>
      </View>
    );
  }

  const totalAccounts = Object.values(accounts).reduce((sum, providerAccounts) => sum + providerAccounts.length, 0);

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
        {/* Summary Card */}
        <Card style={styles.summaryCard}>
          <Card.Content>
            <View style={styles.summaryHeader}>
              <Icon 
                name="account-multiple" 
                size={28} 
                color={theme.colors.primary} 
              />
              <Text variant="titleLarge" style={styles.summaryTitle}>
                Multi-Cloud Accounts
              </Text>
            </View>
            <Text variant="displaySmall" style={styles.totalCount}>
              {totalAccounts}
            </Text>
            <Text variant="bodyMedium" style={styles.summarySubtitle}>
              Connected accounts across all cloud providers
            </Text>
            
            <View style={styles.providerChips}>
              {Object.entries(cloudProviders).map(([provider, info]) => (
                <Chip
                  key={provider}
                  mode="outlined"
                  icon={info.icon}
                  style={[styles.providerChip, { borderColor: info.color }]}
                  textStyle={{ color: info.color }}
                >
                  {accounts[provider]?.length || 0} {info.name}
                </Chip>
              ))}
            </View>
          </Card.Content>
        </Card>

        {/* Provider Sections */}
        {Object.keys(cloudProviders).map(provider => renderProviderSection(provider))}
      </ScrollView>

      {/* Quick Add FAB */}
      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        onPress={() => navigation.navigate('ConnectCloud')}
        label="Add Account"
      />

      {/* Error Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        action={{
          label: 'Retry',
          onPress: () => fetchAccounts(),
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
  totalCount: {
    fontWeight: 'bold',
    marginBottom: 8
  },
  summarySubtitle: {
    opacity: 0.7,
    marginBottom: 16
  },
  providerChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  providerChip: {
    marginRight: 8,
    marginBottom: 4
  },
  providerSection: {
    marginHorizontal: 16,
    marginBottom: 24
  },
  providerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  providerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  providerTitle: {
    marginLeft: 12,
    fontWeight: 'bold',
    flex: 1
  },
  countChip: {
    marginLeft: 8
  },
  addButton: {
    marginLeft: 12
  },
  accountsList: {
    gap: 8
  },
  accountCard: {
    elevation: 2,
    marginBottom: 8
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  accountInfo: {
    flex: 1
  },
  accountTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  accountName: {
    marginLeft: 8,
    fontWeight: '600',
    flex: 1
  },
  statusBadge: {
    marginLeft: 8
  },
  accountId: {
    opacity: 0.7,
    marginBottom: 8
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  statusText: {
    marginLeft: 4,
    fontWeight: '500'
  },
  lastSync: {
    marginLeft: 8,
    opacity: 0.6
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#FFEBEE',
    borderRadius: 4
  },
  errorText: {
    marginLeft: 8,
    flex: 1
  },
  emptyCard: {
    elevation: 1
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24
  },
  emptyText: {
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center'
  },
  emptySubtext: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 16
  },
  emptyButton: {
    marginTop: 8
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0
  }
});

export default MultiAccountScreen;