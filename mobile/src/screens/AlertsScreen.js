import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { 
  Card, 
  Text, 
  Button, 
  FAB, 
  useTheme, 
  Snackbar, 
  Dialog, 
  Portal, 
  TextInput,
  SegmentedButtons,
  Switch,
  Chip,
  List
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import apiService from '../services/apiService';

/**
 * Alert management screen - Week 5 implementation
 */
const AlertsScreen = ({ navigation }) => {
  const theme = useTheme();
  const [alerts, setAlerts] = useState([]);
  const [alertHistory, setAlertHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  
  // Dialog states
  const [createDialogVisible, setCreateDialogVisible] = useState(false);
  const [historyDialogVisible, setHistoryDialogVisible] = useState(false);
  
  // Form states
  const [alertType, setAlertType] = useState('budget_threshold');
  const [provider, setProvider] = useState('all');
  const [thresholdValue, setThresholdValue] = useState('');
  const [thresholdPercentage, setThresholdPercentage] = useState('20');
  const [enabled, setEnabled] = useState(true);

  // Fetch alerts data
  const fetchAlerts = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response = await apiService.get('/alerts');
      setAlerts(response.data || []);
    } catch (err) {
      console.error('Error fetching alerts:', err);
      setError(err.message || 'Failed to fetch alerts');
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Fetch alert history
  const fetchAlertHistory = async () => {
    try {
      const response = await apiService.get('/alerts/history');
      setAlertHistory(response.data || []);
    } catch (err) {
      console.error('Error fetching alert history:', err);
    }
  };

  // Create new alert
  const createAlert = async () => {
    try {
      const alertData = {
        type: alertType,
        provider,
        enabled,
      };

      if (alertType === 'budget_threshold') {
        alertData.thresholdValue = parseFloat(thresholdValue);
      } else if (alertType === 'spike_detection') {
        alertData.thresholdPercentage = parseInt(thresholdPercentage);
      }

      await apiService.post('/alerts', alertData);
      setCreateDialogVisible(false);
      fetchAlerts();
      
      // Reset form
      setAlertType('budget_threshold');
      setProvider('all');
      setThresholdValue('');
      setThresholdPercentage('20');
      setEnabled(true);
    } catch (err) {
      console.error('Error creating alert:', err);
      setError(err.message || 'Failed to create alert');
      setSnackbarVisible(true);
    }
  };

  // Toggle alert enabled/disabled
  const toggleAlert = async (alertId, currentEnabled) => {
    try {
      await apiService.put(`/alerts/${alertId}`, { enabled: !currentEnabled });
      fetchAlerts();
    } catch (err) {
      console.error('Error updating alert:', err);
      setError(err.message || 'Failed to update alert');
      setSnackbarVisible(true);
    }
  };

  // Delete alert
  const deleteAlert = async (alertId) => {
    Alert.alert(
      'Delete Alert',
      'Are you sure you want to delete this alert?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiService.delete(`/alerts/${alertId}`);
              fetchAlerts();
            } catch (err) {
              console.error('Error deleting alert:', err);
              setError(err.message || 'Failed to delete alert');
              setSnackbarVisible(true);
            }
          }
        }
      ]
    );
  };

  // Test notification
  const testNotification = async () => {
    try {
      await apiService.post('/alerts/test-notification');
      Alert.alert('Success', 'Test notification sent!');
    } catch (err) {
      console.error('Error sending test notification:', err);
      setError(err.message || 'Failed to send test notification');
      setSnackbarVisible(true);
    }
  };

  // Initial load
  useEffect(() => {
    fetchAlerts();
  }, []);

  // Format alert type for display
  const formatAlertType = (type) => {
    switch (type) {
      case 'budget_threshold': return 'Budget Threshold';
      case 'spike_detection': return 'Spike Detection';
      case 'daily_summary': return 'Daily Summary';
      case 'weekly_summary': return 'Weekly Summary';
      default: return type;
    }
  };

  // Get alert icon
  const getAlertIcon = (type) => {
    switch (type) {
      case 'budget_threshold': return 'wallet-outline';
      case 'spike_detection': return 'trending-up';
      case 'daily_summary': return 'calendar-today';
      case 'weekly_summary': return 'calendar-week';
      default: return 'bell-outline';
    }
  };

  // Loading state
  if (loading && alerts.length === 0) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text variant="bodyLarge">Loading alerts...</Text>
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
            onRefresh={() => fetchAlerts(true)}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Quick Actions */}
        <Card style={styles.actionsCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.actionsTitle}>
              Quick Actions
            </Text>
            <View style={styles.actionsRow}>
              <Button 
                mode="outlined" 
                onPress={testNotification}
                style={styles.actionButton}
                icon="bell-ring"
              >
                Test Notification
              </Button>
              <Button 
                mode="outlined" 
                onPress={() => {
                  fetchAlertHistory();
                  setHistoryDialogVisible(true);
                }}
                style={styles.actionButton}
                icon="history"
              >
                View History
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* Active Alerts */}
        <Card style={styles.alertsCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.alertsTitle}>
              Active Alerts ({alerts.length})
            </Text>
            
            {alerts.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon name="bell-off-outline" size={48} color={theme.colors.outline} />
                <Text variant="bodyMedium" style={styles.emptyText}>
                  No alerts configured
                </Text>
                <Text variant="bodySmall" style={styles.emptySubtext}>
                  Tap the + button to create your first alert
                </Text>
              </View>
            ) : (
              alerts.map((alert) => (
                <Card key={alert.id} style={styles.alertItem}>
                  <Card.Content>
                    <View style={styles.alertHeader}>
                      <View style={styles.alertInfo}>
                        <Icon 
                          name={getAlertIcon(alert.type)} 
                          size={24} 
                          color={theme.colors.primary} 
                        />
                        <View style={styles.alertDetails}>
                          <Text variant="bodyMedium" style={styles.alertType}>
                            {formatAlertType(alert.type)}
                          </Text>
                          <View style={styles.alertMeta}>
                            <Chip mode="outlined" compact>
                              {alert.provider.toUpperCase()}
                            </Chip>
                            {alert.threshold_value && (
                              <Text variant="bodySmall" style={styles.threshold}>
                                ${alert.threshold_value}
                              </Text>
                            )}
                            {alert.threshold_percentage && (
                              <Text variant="bodySmall" style={styles.threshold}>
                                {alert.threshold_percentage}%
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                      
                      <View style={styles.alertActions}>
                        <Switch
                          value={alert.enabled}
                          onValueChange={() => toggleAlert(alert.id, alert.enabled)}
                        />
                        <Button
                          mode="text"
                          onPress={() => deleteAlert(alert.id)}
                          textColor={theme.colors.error}
                          compact
                        >
                          Delete
                        </Button>
                      </View>
                    </View>
                    
                    {alert.last_triggered && (
                      <Text variant="bodySmall" style={styles.lastTriggered}>
                        Last triggered: {new Date(alert.last_triggered).toLocaleDateString()}
                      </Text>
                    )}
                  </Card.Content>
                </Card>
              ))
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Floating Action Button */}
      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => setCreateDialogVisible(true)}
      />

      {/* Create Alert Dialog */}
      <Portal>
        <Dialog visible={createDialogVisible} onDismiss={() => setCreateDialogVisible(false)}>
          <Dialog.Title>Create New Alert</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={styles.dialogLabel}>Alert Type</Text>
            <SegmentedButtons
              value={alertType}
              onValueChange={setAlertType}
              buttons={[
                { value: 'budget_threshold', label: 'Budget' },
                { value: 'spike_detection', label: 'Spike' },
                { value: 'daily_summary', label: 'Daily' },
                { value: 'weekly_summary', label: 'Weekly' }
              ]}
              style={styles.segmentedButtons}
            />

            <Text variant="bodyMedium" style={styles.dialogLabel}>Cloud Provider</Text>
            <SegmentedButtons
              value={provider}
              onValueChange={setProvider}
              buttons={[
                { value: 'all', label: 'All' },
                { value: 'aws', label: 'AWS' },
                { value: 'azure', label: 'Azure' },
                { value: 'gcp', label: 'GCP' }
              ]}
              style={styles.segmentedButtons}
            />

            {alertType === 'budget_threshold' && (
              <TextInput
                label="Budget Threshold ($)"
                value={thresholdValue}
                onChangeText={setThresholdValue}
                keyboardType="numeric"
                style={styles.input}
              />
            )}

            {alertType === 'spike_detection' && (
              <TextInput
                label="Spike Threshold (%)"
                value={thresholdPercentage}
                onChangeText={setThresholdPercentage}
                keyboardType="numeric"
                style={styles.input}
              />
            )}

            <View style={styles.switchRow}>
              <Text variant="bodyMedium">Enabled</Text>
              <Switch value={enabled} onValueChange={setEnabled} />
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setCreateDialogVisible(false)}>Cancel</Button>
            <Button onPress={createAlert}>Create</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Alert History Dialog */}
        <Dialog 
          visible={historyDialogVisible} 
          onDismiss={() => setHistoryDialogVisible(false)}
          style={styles.historyDialog}
        >
          <Dialog.Title>Alert History</Dialog.Title>
          <Dialog.ScrollArea>
            <ScrollView contentContainerStyle={styles.historyContent}>
              {alertHistory.length === 0 ? (
                <Text variant="bodyMedium" style={styles.emptyHistory}>
                  No alert history available
                </Text>
              ) : (
                alertHistory.map((history) => (
                  <List.Item
                    key={history.id}
                    title={history.message}
                    description={`${history.provider.toUpperCase()} • ${new Date(history.triggered_at).toLocaleDateString()}`}
                    left={() => <List.Icon icon="bell" />}
                    right={() => (
                      <Text variant="bodySmall" style={styles.historyAmount}>
                        ${history.current_value}
                      </Text>
                    )}
                  />
                ))
              )}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setHistoryDialogVisible(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Error Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
        action={{
          label: 'Retry',
          onPress: () => fetchAlerts(),
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
  scrollContent: {
    padding: 16,
    paddingBottom: 32
  },
  comingSoonCard: {
    elevation: 4,
    marginBottom: 16
  },
  comingSoonContent: {
    alignItems: 'center',
    paddingVertical: 32
  },
  comingSoonIcon: {
    marginBottom: 16
  },
  comingSoonTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center'
  },
  comingSoonSubtitle: {
    opacity: 0.7,
    marginBottom: 16,
    textAlign: 'center'
  },
  comingSoonDescription: {
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 16
  },
  featuresCard: {
    elevation: 2,
    marginBottom: 16
  },
  featuresTitle: {
    fontWeight: 'bold',
    marginBottom: 16
  },
  featuresList: {
    gap: 16
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16
  },
  featureContent: {
    flex: 1
  },
  featureTitle: {
    fontWeight: '500',
    marginBottom: 4
  },
  featureDescription: {
    opacity: 0.7,
    lineHeight: 18
  },
  ctaCard: {
    elevation: 2
  },
  ctaContent: {
    alignItems: 'center',
    paddingVertical: 16
  },
  ctaText: {
    marginBottom: 16,
    textAlign: 'center'
  },
  ctaButton: {
    paddingHorizontal: 24
  }
});

export default AlertsScreen;