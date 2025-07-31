import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

/**
 * CloudCost Buddy Theme Configuration
 * Material Design 3 theme with cloud provider colors
 */
export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1976d2',
    primaryContainer: '#e3f2fd',
    secondary: '#0288d1',
    secondaryContainer: '#b3e5fc',
    surface: '#ffffff',
    surfaceVariant: '#f5f5f5',
    onSurface: '#212121',
    onSurfaceVariant: '#757575',
    outline: '#e0e0e0',
    // Cloud provider colors
    aws: '#ff9900',
    azure: '#0078d4',
    gcp: '#4285f4',
    // Status colors
    success: '#4caf50',
    warning: '#ff9800',
    error: '#f44336',
    info: '#2196f3'
  }
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#90caf9',
    primaryContainer: '#1565c0',
    secondary: '#81d4fa',
    secondaryContainer: '#0277bd',
    surface: '#121212',
    surfaceVariant: '#1e1e1e',
    onSurface: '#ffffff',
    onSurfaceVariant: '#b0b0b0',
    outline: '#424242',
    // Cloud provider colors (adjusted for dark theme)
    aws: '#ffb74d',
    azure: '#4fc3f7',
    gcp: '#64b5f6',
    // Status colors (adjusted for dark theme)
    success: '#81c784',
    warning: '#ffb74d',
    error: '#e57373',
    info: '#64b5f6'
  }
};

// Default to light theme
export const theme = lightTheme;