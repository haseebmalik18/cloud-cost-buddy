import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// Import screens
import DashboardScreen from '../screens/DashboardScreen';
import CloudsScreen from '../screens/CloudsScreen';
import TrendsScreen from '../screens/TrendsScreen';
import AlertsScreen from '../screens/AlertsScreen';

const Tab = createBottomTabNavigator();

/**
 * Main App Navigator
 * Bottom tab navigation for the main app sections
 */
export default function AppNavigator() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          switch (route.name) {
            case 'Dashboard':
              iconName = focused ? 'view-dashboard' : 'view-dashboard-outline';
              break;
            case 'Clouds':
              iconName = focused ? 'cloud' : 'cloud-outline';
              break;
            case 'Trends':
              iconName = focused ? 'chart-line' : 'chart-line-variant';
              break;
            case 'Alerts':
              iconName = focused ? 'bell' : 'bell-outline';
              break;
            default:
              iconName = 'help-circle-outline';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outline,
          borderTopWidth: 1,
          paddingTop: 5,
          paddingBottom: 5,
          height: 60
        },
        headerStyle: {
          backgroundColor: theme.colors.surface,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.outline
        },
        headerTitleStyle: {
          color: theme.colors.onSurface,
          fontSize: 20,
          fontWeight: 'bold'
        },
        headerTintColor: theme.colors.onSurface
      })}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen}
        options={{
          title: 'Dashboard',
          headerTitle: 'CloudCost Buddy'
        }}
      />
      <Tab.Screen 
        name="Clouds" 
        component={CloudsScreen}
        options={{
          title: 'Clouds',
          headerTitle: 'Cloud Providers'
        }}
      />
      <Tab.Screen 
        name="Trends" 
        component={TrendsScreen}
        options={{
          title: 'Trends',
          headerTitle: 'Cost Trends'
        }}
      />
      <Tab.Screen 
        name="Alerts" 
        component={AlertsScreen}
        options={{
          title: 'Alerts',
          headerTitle: 'Cost Alerts'
        }}
      />
    </Tab.Navigator>
  );
}