import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../contexts/AuthContext';

// Import screens
import DashboardScreen from '../screens/DashboardScreen';
import CloudsScreen from '../screens/CloudsScreen';
import TrendsScreen from '../screens/TrendsScreen';
import AlertsScreen from '../screens/AlertsScreen';
import LoginScreen from '../screens/LoginScreen';
import ConnectCloudScreen from '../screens/ConnectCloudScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

/**
 * Main Tab Navigator
 * Bottom tab navigation for authenticated users
 */
function MainTabNavigator() {
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
          headerTitle: 'Cloud Providers',
          headerRight: ({ navigation }) => (
            <Icon 
              name="plus" 
              size={24} 
              color={theme.colors.primary}
              style={{ marginRight: 16 }}
              onPress={() => navigation.navigate('ConnectCloud')}
            />
          )
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

/**
 * Main App Navigator
 * Handles authentication flow and main app navigation
 */
export default function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const theme = useTheme();

  if (isLoading) {
    // Show loading screen while checking auth state
    return null; // Or a loading component
  }

  return (
    <Stack.Navigator
      screenOptions={{
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
      }}
    >
      {isAuthenticated ? (
        // Authenticated stack
        <>
          <Stack.Screen
            name="MainTabs"
            component={MainTabNavigator}
            options={{ headerShown: false }}
          />
          <Stack.Screen
            name="ConnectCloud"
            component={ConnectCloudScreen}
            options={{
              title: 'Connect Cloud Provider',
              presentation: 'modal'
            }}
          />
        </>
      ) : (
        // Authentication stack
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
      )}
    </Stack.Navigator>
  );
}