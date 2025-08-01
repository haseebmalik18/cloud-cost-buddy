import React, { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Card, Text, Button, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

/**
 * Alert management screen (placeholder - not yet implemented)
 */
const AlertsScreen = ({ navigation }) => {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Alert System Preview Card */}
        <Card style={styles.comingSoonCard}>
          <Card.Content style={styles.comingSoonContent}>
            <Icon 
              name="bell-outline" 
              size={64} 
              color={theme.colors.primary} 
              style={styles.comingSoonIcon}
            />
            
            <Text variant="headlineMedium" style={styles.comingSoonTitle}>
              Cost Alerts
            </Text>
            
            <Text variant="bodyLarge" style={styles.comingSoonSubtitle}>
              Not Yet Implemented
            </Text>
            
            <Text variant="bodyMedium" style={styles.comingSoonDescription}>
              Set up budget thresholds, spike detection alerts, and daily/weekly cost summaries to stay on top of your cloud spending.
            </Text>
          </Card.Content>
        </Card>

        {/* Features Preview */}
        <Card style={styles.featuresCard}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.featuresTitle}>
              Planned Features
            </Text>
            
            <View style={styles.featuresList}>
              <View style={styles.featureItem}>
                <Icon 
                  name="alert-circle-outline" 
                  size={24} 
                  color={theme.colors.primary} 
                />
                <View style={styles.featureContent}>
                  <Text variant="bodyMedium" style={styles.featureTitle}>
                    Budget Threshold Alerts
                  </Text>
                  <Text variant="bodySmall" style={styles.featureDescription}>
                    Get notified when your cloud spending approaches or exceeds your budget limits
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <Icon 
                  name="trending-up" 
                  size={24} 
                  color={theme.colors.warning} 
                />
                <View style={styles.featureContent}>
                  <Text variant="bodyMedium" style={styles.featureTitle}>
                    Spike Detection
                  </Text>
                  <Text variant="bodySmall" style={styles.featureDescription}>
                    Automatic detection of unusual cost increases (20%+ above baseline)
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <Icon 
                  name="email-outline" 
                  size={24} 
                  color={theme.colors.success} 
                />
                <View style={styles.featureContent}>
                  <Text variant="bodyMedium" style={styles.featureTitle}>
                    Daily & Weekly Summaries
                  </Text>
                  <Text variant="bodySmall" style={styles.featureDescription}>
                    Regular cost summaries delivered via push notifications
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <Icon 
                  name="bell-ring" 
                  size={24} 
                  color={theme.colors.error} 
                />
                <View style={styles.featureContent}>
                  <Text variant="bodyMedium" style={styles.featureTitle}>
                    Real-time Notifications
                  </Text>
                  <Text variant="bodySmall" style={styles.featureDescription}>
                    Instant push notifications powered by Firebase Cloud Messaging
                  </Text>
                </View>
              </View>

              <View style={styles.featureItem}>
                <Icon 
                  name="tune" 
                  size={24} 
                  color={theme.colors.info} 
                />
                <View style={styles.featureContent}>
                  <Text variant="bodyMedium" style={styles.featureTitle}>
                    Customizable Thresholds
                  </Text>
                  <Text variant="bodySmall" style={styles.featureDescription}>
                    Set different alert thresholds for each cloud provider and service
                  </Text>
                </View>
              </View>
            </View>
          </Card.Content>
        </Card>


        {/* CTA Button */}
        <Card style={styles.ctaCard}>
          <Card.Content style={styles.ctaContent}>
            <Text variant="bodyMedium" style={styles.ctaText}>
              Alert system is not yet implemented
            </Text>
            <Button 
              mode="contained" 
              onPress={() => alert('Alert system is not yet implemented')}
              style={styles.ctaButton}
            >
              Back to Dashboard
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>
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