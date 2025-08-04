import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import apiService from './apiService';

/**
 * Authentication service for user login and cloud provider connections
 */
class AuthService {
  constructor() {
    this.currentUser = null;
    this.authToken = null;
    this.refreshToken = null;
    this.isInitialized = false;
  }

  /**
   * Initialize service and load stored auth data
   */
  async initialize() {
    try {
      const [storedToken, storedRefreshToken, storedUser] = await Promise.all([
        AsyncStorage.getItem('@auth_token'),
        AsyncStorage.getItem('@refresh_token'),
        AsyncStorage.getItem('@current_user')
      ]);

      if (storedToken) {
        this.authToken = storedToken;
        apiService.setAuthToken(storedToken);
      }

      if (storedRefreshToken) {
        this.refreshToken = storedRefreshToken;
      }

      if (storedUser) {
        this.currentUser = JSON.parse(storedUser);
      }

      this.isInitialized = true;
    } catch (error) {
      // console.error('AuthService initialization error:', error);
      this.isInitialized = true;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return !!(this.authToken && this.currentUser);
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Register new user
   */
  async register(userData) {
    try {
      const response = await apiService.auth.register(userData);
      
      if (response.data.success) {
        const { user, tokens } = response.data.data;
        await this.setAuthData(user, tokens.accessToken, tokens.refreshToken);
        return { success: true, user };
      } else {
        throw new Error(response.data.message || 'Registration failed');
      }
    } catch (error) {
      // console.error('Registration error:', error);
      throw error;
    }
  }

  /**
   * Login user
   */
  async login(credentials) {
    try {
      const response = await apiService.auth.login(credentials);
      
      if (response.data.success) {
        const { user, tokens } = response.data.data;
        await this.setAuthData(user, tokens.accessToken, tokens.refreshToken);
        return { success: true, user };
      } else {
        throw new Error(response.data.message || 'Login failed');
      }
    } catch (error) {
      // console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Logout user
   */
  async logout() {
    try {
      // Call backend logout endpoint
      if (this.authToken) {
        await apiService.auth.logout();
      }
    } catch (error) {
      // console.error('Logout API error:', error);
      // Continue with local logout even if API call fails
    }

    // Clear local storage
    await this.clearAuthData();
  }

  /**
   * Update user profile
   */
  async updateProfile(userData) {
    try {
      const response = await apiService.auth.updateProfile(userData);
      
      if (response.data.success) {
        const updatedUser = response.data.data.user;
        this.currentUser = updatedUser;
        await AsyncStorage.setItem('@current_user', JSON.stringify(updatedUser));
        return { success: true, user: updatedUser };
      } else {
        throw new Error(response.data.message || 'Profile update failed');
      }
    } catch (error) {
      // console.error('Profile update error:', error);
      throw error;
    }
  }

  /**
   * Connect AWS account using OAuth
   */
  async connectAWS(accessToken, accountName = null, region = 'us-east-1') {
    try {
      const response = await apiService.auth.connectAWS({
        accessToken,
        accountName,
        region
      });

      if (response.data.success) {
        return { success: true, account: response.data.data.account };
      } else {
        throw new Error(response.data.message || 'AWS connection failed');
      }
    } catch (error) {
      // console.error('AWS connection error:', error);
      throw error;
    }
  }

  /**
   * Connect Azure account using OAuth
   */
  async connectAzure(accessToken, subscriptionId = null, accountName = null) {
    try {
      const response = await apiService.auth.connectAzure({
        accessToken,
        subscriptionId,
        accountName
      });

      if (response.data.success) {
        return { success: true, account: response.data.data.account };
      } else {
        throw new Error(response.data.message || 'Azure connection failed');
      }
    } catch (error) {
      // console.error('Azure connection error:', error);
      throw error;
    }
  }

  /**
   * Connect GCP account using OAuth
   */
  async connectGCP(accessToken, refreshToken = null, projectId = null, accountName = null) {
    try {
      const response = await apiService.auth.connectGCP({
        accessToken,
        refreshToken,
        projectId,
        accountName
      });

      if (response.data.success) {
        return { success: true, account: response.data.data.account };
      } else {
        throw new Error(response.data.message || 'GCP connection failed');
      }
    } catch (error) {
      // console.error('GCP connection error:', error);
      throw error;
    }
  }

  /**
   * Initiate OAuth flow for cloud provider
   */
  async initiateOAuth(provider) {
    try {
      const { default: oauthService } = await import('./oauthService');
      const result = await oauthService.initiateOAuth(provider);
      return result;
    } catch (error) {
      // console.error(`${provider} OAuth initiation error:`, error);
      throw error;
    }
  }

  /**
   * Handle OAuth redirect response
   */
  async handleOAuthRedirect(url, provider) {
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      const fragment = new URLSearchParams(urlObj.hash.substring(1));

      let accessToken, refreshToken, error;

      // Extract tokens based on OAuth flow type
      if (params.has('code')) {
        // Authorization code flow - exchange code for tokens
        const code = params.get('code');
        const tokenData = await this.exchangeCodeForTokens(code, provider);
        accessToken = tokenData.access_token;
        refreshToken = tokenData.refresh_token;
      } else if (fragment.has('access_token')) {
        // Implicit flow - tokens in fragment
        accessToken = fragment.get('access_token');
        refreshToken = fragment.get('refresh_token');
      } else if (params.has('error') || fragment.has('error')) {
        error = params.get('error') || fragment.get('error');
        const errorDescription = params.get('error_description') || fragment.get('error_description');
        throw new Error(`OAuth error: ${error} - ${errorDescription}`);
      }

      if (!accessToken) {
        throw new Error('No access token received from OAuth flow');
      }

      // Connect the cloud account
      let result;
      switch (provider?.toLowerCase()) {
        case 'aws':
          result = await this.connectAWS(accessToken);
          break;
        case 'azure':
          result = await this.connectAzure(accessToken);
          break;
        case 'gcp':
          result = await this.connectGCP(accessToken, refreshToken);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      return result;
    } catch (error) {
      // console.error('OAuth redirect handling error:', error);
      throw error;
    }
  }


  /**
   * Set authentication data and persist to storage
   */
  async setAuthData(user, accessToken, refreshToken = null) {
    this.currentUser = user;
    this.authToken = accessToken;
    this.refreshToken = refreshToken;

    // Set token in API service
    apiService.setAuthToken(accessToken);

    // Persist to storage
    await Promise.all([
      AsyncStorage.setItem('@current_user', JSON.stringify(user)),
      AsyncStorage.setItem('@auth_token', accessToken),
      refreshToken ? AsyncStorage.setItem('@refresh_token', refreshToken) : Promise.resolve()
    ]);

  }

  /**
   * Clear authentication data
   */
  async clearAuthData() {
    this.currentUser = null;
    this.authToken = null;
    this.refreshToken = null;

    // Clear token from API service
    apiService.clearAuthToken();

    // Remove from storage
    await Promise.all([
      AsyncStorage.removeItem('@current_user'),
      AsyncStorage.removeItem('@auth_token'),
      AsyncStorage.removeItem('@refresh_token')
    ]);

  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(provider) {
    if (!this.refreshToken) {
      throw new Error('No refresh token available');
    }

    if (!provider) {
      throw new Error('Provider is required for token refresh');
    }

    try {
      const { default: oauthService } = await import('./oauthService');
      
      const result = await oauthService.refreshTokens(provider, this.refreshToken);
      
      if (result.success) {
        this.authToken = result.tokens.accessToken;
        this.refreshToken = result.tokens.refreshToken;
        
        apiService.setAuthToken(result.tokens.accessToken);
        await Promise.all([
          AsyncStorage.setItem('@auth_token', result.tokens.accessToken),
          AsyncStorage.setItem('@refresh_token', result.tokens.refreshToken)
        ]);
        
        return result;
      } else {
        throw new Error('Token refresh failed');
      }
    } catch (error) {
      // console.error('Token refresh error:', error);
      await this.logout();
      throw error;
    }
  }
}

// Export singleton instance
export default new AuthService();