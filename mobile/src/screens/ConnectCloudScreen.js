import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Linking
} from 'react-native';
import {
  Text,
  Card,
  Button,
  Chip,
  useTheme,
  ActivityIndicator,
  Snackbar
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import authService from '../services/authService';
import oauthService from '../services/oauthService';
import apiService from '../services/apiService';

/**
 * Screen for connecting cloud provider accounts via OAuth
 */
const ConnectCloudScreen = ({ navigation }) => {
  const theme = useTheme();
  const [connectedAccounts, setConnectedAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [connectingProvider, setConnectingProvider] = useState(null);

  const [cloudProviders, setCloudProviders] = useState([]);

  useEffect(() => {
    const providers = oauthService.getSupportedProviders().map(provider => ({
      ...provider,
      icon: provider.id === 'aws' ? 'aws' : 
            provider.id === 'azure' ? 'microsoft-azure' : 
            provider.id === 'gcp' ? 'google-cloud' : 'cloud',
      color: provider.id === 'aws' ? theme.colors.aws || '#FF9900' :
             provider.id === 'azure' ? theme.colors.azure || '#0078D4' :
             provider.id === 'gcp' ? theme.colors.gcp || '#4285F4' : theme.colors.primary,
      features: provider.scopes
    }));
    setCloudProviders(providers);
  }, [theme]);

  useEffect(() => {
    fetchConnectedAccounts();
  }, []);

  const fetchConnectedAccounts = async () => {
    try {
      setRefreshing(true);
      const response = await apiService.accounts.getAll();
      
      if (response.data.success) {
        setConnectedAccounts(response.data.data.accounts || []);
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
      setSnackbarMessage('Failed to fetch connected accounts');
      setSnackbarVisible(true);
    } finally {
      setRefreshing(false);
    }
  };

  const handleConnectProvider = async (provider) => {
    try {
      if (!oauthService.isProviderConfigured(provider.id)) {
        const errors = oauthService.getConfigurationErrors(provider.id);
        Alert.alert(
          'Configuration Required',
          `${provider.name} is not properly configured:\n\n${errors.join('\n')}\n\nPlease update your app.json configuration.`,
          [{ text: 'OK' }]
        );
        return;
      }

      setConnectingProvider(provider.id);
      setLoading(true);
      Alert.alert(
        `Connect ${provider.name}`,
        `You will be redirected to ${provider.name} to authorize CloudCost Buddy. Please grant the necessary permissions to monitor your costs.`,
        [
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => {
              setLoading(false);
              setConnectingProvider(null);
            }
          },
          {
            text: 'Continue',
            onPress: async () => {
              try {
                const result = await oauthService.initiateOAuth(provider.id);
                
                if (result.success) {
                  setSnackbarMessage(`${provider.name} account connected successfully!`);
                  setSnackbarVisible(true);
                  fetchConnectedAccounts();
                }
              } catch (error) {
                console.error(`${provider.id} OAuth error:`, error);
                setSnackbarMessage(`Failed to connect ${provider.name}: ${error.message}`);
                setSnackbarVisible(true);
              } finally {
                setLoading(false);
                setConnectingProvider(null);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Connect provider error:', error);
      setSnackbarMessage(`Failed to connect ${provider.name}: ${error.message}`);
      setSnackbarVisible(true);
      setLoading(false);
      setConnectingProvider(null);
    }
  };

  const handleDisconnectAccount = (account) => {
    Alert.alert(
      'Disconnect Account',
      `Are you sure you want to disconnect ${account.account_name}? This will stop cost monitoring for this account.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.accounts.disconnect(account.id);
              setSnackbarMessage('Account disconnected successfully');
              setSnackbarVisible(true);
              fetchConnectedAccounts();
            } catch (error) {
              console.error('Disconnect error:', error);
              setSnackbarMessage('Failed to disconnect account');
              setSnackbarVisible(true);
            }
          }
        }
      ]
    );
  };

  const handleTestConnection = async (account) => {
    try {
      setLoading(true);
      const response = await apiService.accounts.testConnection(account.id);
      
      if (response.data.success) {
        setSnackbarMessage(`${account.account_name} connection is healthy`);
      } else {
        setSnackbarMessage(`Connection test failed: ${response.data.message}`);
      }
      setSnackbarVisible(true);
    } catch (error) {
      console.error('Test connection error:', error);
      setSnackbarMessage('Connection test failed');
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const isProviderConnected = (providerId) => {
    return connectedAccounts.some(account => 
      account.provider === providerId && account.is_active
    );
  };

  const getConnectedAccount = (providerId) => {
    return connectedAccounts.find(account => 
      account.provider === providerId && account.is_active
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Icon
            name="cloud-sync"
            size={48}
            color={theme.colors.primary}
          />
          <Text variant="headlineSmall" style={styles.title}>
            Connect Cloud Providers
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Connect your cloud accounts to start monitoring costs
          </Text>
        </View>

        {/* Connected Accounts */}
        {connectedAccounts.length > 0 && (
          <View style={styles.section}>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Connected Accounts
            </Text>
            {connectedAccounts.map((account) => (
              <Card key={account.id} style={styles.accountCard}>
                <Card.Content>
                  <View style={styles.accountHeader}>
                    <View style={styles.accountInfo}>
                      <Icon
                        name={cloudProviders.find(p => p.id === account.provider)?.icon || 'cloud'}
                        size={24}
                        color={cloudProviders.find(p => p.id === account.provider)?.color || theme.colors.primary}
                      />
                      <View style={styles.accountDetails}>
                        <Text variant="titleSmall" style={styles.accountName}>
                          {account.account_name}
                        </Text>
                        <Text variant="bodySmall" style={styles.accountProvider}>
                          {account.provider.toUpperCase()} • {account.account_id}
                        </Text>
                      </View>
                    </View>
                    <Chip
                      mode="outlined"
                      compact
                      textStyle={{
                        color: account.sync_status === 'success' ? theme.colors.success :
                               account.sync_status === 'error' ? theme.colors.error :
                               theme.colors.warning
                      }}
                    >
                      {account.sync_status || 'Unknown'}
                    </Chip>
                  </View>
                  
                  <View style={styles.accountActions}>
                    <Button
                      mode="outlined"
                      compact
                      onPress={() => handleTestConnection(account)}
                      disabled={loading}
                    >
                      Test Connection
                    </Button>
                    <Button
                      mode="text"
                      compact
                      onPress={() => handleDisconnectAccount(account)}
                      disabled={loading}
                      textColor={theme.colors.error}
                    >
                      Disconnect
                    </Button>
                  </View>
                </Card.Content>
              </Card>
            ))}
          </View>
        )}

        {/* Available Providers */}
        <View style={styles.section}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Available Providers
          </Text>
          
          {cloudProviders.map((provider) => {
            const isConnected = isProviderConnected(provider.id);
            const connectedAccount = getConnectedAccount(provider.id);
            
            return (
              <Card key={provider.id} style={styles.providerCard}>
                <Card.Content>
                  <View style={styles.providerHeader}>
                    <Icon
                      name={provider.icon}
                      size={32}
                      color={provider.color}
                    />
                    <View style={styles.providerInfo}>
                      <Text variant="titleMedium" style={styles.providerName}>
                        {provider.name}
                      </Text>
                      <Text variant="bodySmall" style={styles.providerDescription}>
                        {provider.description}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.features}>
                    {provider.features.map((feature) => (
                      <Chip
                        key={feature}
                        mode="outlined"
                        compact
                        style={styles.featureChip}
                      >
                        {feature}
                      </Chip>
                    ))}
                  </View>

                  <View style={styles.providerActions}>
                    {isConnected ? (
                      <View style={styles.connectedStatus}>
                        <Icon
                          name="check-circle"
                          size={20}
                          color={theme.colors.success}
                        />
                        <Text variant="bodyMedium" style={styles.connectedText}>
                          Connected as {connectedAccount?.account_name}
                        </Text>
                      </View>
                    ) : (
                      <Button
                        mode="contained"
                        onPress={() => handleConnectProvider(provider)}
                        disabled={loading || connectingProvider === provider.id}
                        loading={connectingProvider === provider.id}
                        style={[styles.connectButton, { backgroundColor: provider.color }]}
                      >
                        Connect {provider.name}
                      </Button>
                    )}
                  </View>
                </Card.Content>
              </Card>
            );
          })}
        </View>

        {/* Instructions */}
        <Card style={styles.instructionsCard}>
          <Card.Content>
            <View style={styles.instructionsHeader}>
              <Icon
                name="information"
                size={24}
                color={theme.colors.primary}
              />
              <Text variant="titleMedium" style={styles.instructionsTitle}>
                How it Works
              </Text>
            </View>
            
            <View style={styles.instructionsList}>
              <Text variant="bodyMedium" style={styles.instructionItem}>
                1. Click "Connect" for your cloud provider
              </Text>
              <Text variant="bodyMedium" style={styles.instructionItem}>
                2. Authorize CloudCost Buddy in your browser
              </Text>
              <Text variant="bodyMedium" style={styles.instructionItem}>
                3. Return to the app to complete setup
              </Text>
              <Text variant="bodyMedium" style={styles.instructionItem}>
                4. Start monitoring your cloud costs!
              </Text>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Loading overlay */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text variant="bodyMedium" style={styles.loadingText}>
            {connectingProvider ? `Connecting to ${connectingProvider.toUpperCase()}...` : 'Loading...'}
          </Text>
        </View>
      )}

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        action={{
          label: 'Dismiss',
          onPress: () => setSnackbarVisible(false),
        }}
      >
        {snackbarMessage}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  scrollContent: {
    paddingBottom: 20
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 24
  },
  title: {
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center'
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.7
  },
  section: {
    marginBottom: 24
  },
  sectionTitle: {
    fontWeight: 'bold',
    marginHorizontal: 16,
    marginBottom: 12
  },
  accountCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    elevation: 2
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  accountInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  accountDetails: {
    marginLeft: 12,
    flex: 1
  },
  accountName: {
    fontWeight: '600'
  },
  accountProvider: {
    opacity: 0.7,
    marginTop: 2
  },
  accountActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8
  },
  providerCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    elevation: 2
  },
  providerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  providerInfo: {
    marginLeft: 16,
    flex: 1
  },
  providerName: {
    fontWeight: 'bold'
  },
  providerDescription: {
    opacity: 0.7,
    marginTop: 4
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16
  },
  featureChip: {
    height: 28
  },
  providerActions: {
    alignItems: 'center'
  },
  connectedStatus: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  connectedText: {
    marginLeft: 8,
    color: '#4caf50',
    fontWeight: '500'
  },
  connectButton: {
    width: '100%'
  },
  instructionsCard: {
    marginHorizontal: 16,
    elevation: 2
  },
  instructionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16
  },
  instructionsTitle: {
    marginLeft: 12,
    fontWeight: 'bold'
  },
  instructionsList: {
    gap: 8
  },
  instructionItem: {
    lineHeight: 20
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    marginTop: 16,
    color: 'white',
    textAlign: 'center'
  }
});

export default ConnectCloudScreen;