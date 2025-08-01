import React, { createContext, useContext, useEffect, useState } from 'react';
import authService from '../services/authService';

/**
 * Authentication Context
 * Provides authentication state and methods throughout the app
 */
const AuthContext = createContext({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  updateProfile: async () => {},
  connectCloud: async () => {},
  refreshUser: async () => {}
});

/**
 * Authentication Provider Component
 */
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize authentication on app start
  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      setIsLoading(true);
      
      // Initialize auth service
      await authService.initialize();
      
      // Check if user is authenticated
      if (authService.isAuthenticated()) {
        const currentUser = authService.getCurrentUser();
        setUser(currentUser);
        
        // Optionally refresh user data from backend
        try {
          await refreshUser();
        } catch (error) {
          // Keep local user data if refresh fails
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      // Clear any invalid auth data
      await authService.logout();
    } finally {
      setIsLoading(false);
    }
  };

  // Login function
  const login = async (credentials) => {
    try {
      const result = await authService.login(credentials);
      if (result.success) {
        setUser(result.user);
        return result;
      }
      throw new Error('Login failed');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  // Register function
  const register = async (userData) => {
    try {
      const result = await authService.register(userData);
      if (result.success) {
        setUser(result.user);
        return result;
      }
      throw new Error('Registration failed');
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await authService.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
      // Clear user state even if logout API call fails
      setUser(null);
    }
  };

  // Update profile function
  const updateProfile = async (userData) => {
    try {
      const result = await authService.updateProfile(userData);
      if (result.success) {
        setUser(result.user);
        return result;
      }
      throw new Error('Profile update failed');
    } catch (error) {
      console.error('Profile update error:', error);
      throw error;
    }
  };

  // Connect cloud account function
  const connectCloud = async (provider, tokenData) => {
    try {
      let result;
      
      switch (provider?.toLowerCase()) {
        case 'aws':
          result = await authService.connectAWS(
            tokenData.accessToken,
            tokenData.accountName,
            tokenData.region
          );
          break;
        case 'azure':
          result = await authService.connectAzure(
            tokenData.accessToken,
            tokenData.subscriptionId,
            tokenData.accountName
          );
          break;
        case 'gcp':
          result = await authService.connectGCP(
            tokenData.accessToken,
            tokenData.refreshToken,
            tokenData.projectId,
            tokenData.accountName
          );
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      if (result.success) {
        // Refresh user data to include new cloud account
        await refreshUser();
        return result;
      }
      
      throw new Error(`Failed to connect ${provider}`);
    } catch (error) {
      console.error('Connect cloud error:', error);
      throw error;
    }
  };

  // Refresh user data from backend
  const refreshUser = async () => {
    try {
      // This would typically call the /auth/me endpoint
      // For now, we'll use the current user data
      const currentUser = authService.getCurrentUser();
      if (currentUser) {
        setUser(currentUser);
      }
      return { success: true, user: currentUser };
    } catch (error) {
      console.error('Refresh user error:', error);
      throw error;
    }
  };

  // Check if user is authenticated
  const isAuthenticated = !!user && authService.isAuthenticated();

  const contextValue = {
    user,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    updateProfile,
    connectCloud,
    refreshUser
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook to use authentication context
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;