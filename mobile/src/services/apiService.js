import axios from 'axios';
import Constants from 'expo-constants';

/**
 * API service for backend communication
 */
class ApiService {
  constructor() {
    this.baseURL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000/api';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    // Store for authentication token
    this.authToken = null;

    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        // Add auth token to requests if available
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => {
        console.error('API Request Error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        return Promise.reject(this.handleError(error));
      }
    );
  }

  /**
   * Handle API errors with consistent error format
   */
  handleError(error) {
    if (error.response) {
      // Server responded with error status
      return {
        message: error.response.data?.message || 'Server error occurred',
        status: error.response.status,
        data: error.response.data
      };
    } else if (error.request) {
      // Network error
      return {
        message: 'Network error - please check your connection',
        status: 0,
        data: null
      };
    } else {
      // Other error
      return {
        message: error.message || 'An unexpected error occurred',
        status: -1,
        data: null
      };
    }
  }

  /**
   * Dashboard API endpoints
   */
  dashboard = {
    // Get multi-cloud summary
    getSummary: () => this.client.get('/dashboard/summary'),
    
    // Get cloud provider comparison
    getComparison: (params = {}) => this.client.get('/dashboard/compare', { params }),
    
    // Get health status
    getHealth: () => this.client.get('/dashboard/health')
  };

  /**
   * AWS API endpoints
   */
  aws = {
    // Get current month costs
    getCurrentCosts: (params = {}) => this.client.get('/aws/costs/current', { params }),
    
    // Get cost trends
    getTrends: (params) => this.client.get('/aws/costs/trends', { params }),
    
    // Get top services
    getTopServices: (limit = 5) => this.client.get('/aws/services/top', { params: { limit } }),
    
    // Get budgets
    getBudgets: (accountId) => this.client.get('/aws/budgets', { params: { accountId } }),
    
    // Get forecast
    getForecast: () => this.client.get('/aws/forecast'),
    
    // Get summary
    getSummary: () => this.client.get('/aws/summary'),
    
    // Health check
    getHealth: () => this.client.get('/aws/health')
  };

  /**
   * Azure API endpoints
   */
  azure = {
    // Get current month costs
    getCurrentCosts: (params = {}) => this.client.get('/azure/costs/current', { params }),
    
    // Get cost trends
    getTrends: (params) => this.client.get('/azure/costs/trends', { params }),
    
    // Get top services
    getTopServices: (limit = 5) => this.client.get('/azure/services/top', { params: { limit } }),
    
    // Get budgets
    getBudgets: () => this.client.get('/azure/budgets'),
    
    // Get forecast
    getForecast: () => this.client.get('/azure/forecast'),
    
    // Get summary
    getSummary: () => this.client.get('/azure/summary'),
    
    // Health check
    getHealth: () => this.client.get('/azure/health')
  };

  /**
   * GCP API endpoints
   */
  gcp = {
    // Get current month costs
    getCurrentCosts: (params = {}) => this.client.get('/gcp/costs/current', { params }),
    
    // Get cost trends
    getTrends: (params) => this.client.get('/gcp/costs/trends', { params }),
    
    // Get top services
    getTopServices: (limit = 5) => this.client.get('/gcp/services/top', { params: { limit } }),
    
    // Get budgets
    getBudgets: () => this.client.get('/gcp/budgets'),
    
    // Get forecast
    getForecast: () => this.client.get('/gcp/forecast'),
    
    // Get summary
    getSummary: () => this.client.get('/gcp/summary'),
    
    // Health check
    getHealth: () => this.client.get('/gcp/health'),
    
    // Get billing account info
    getBillingAccount: () => this.client.get('/gcp/billing-account')
  };

  /**
   * Authentication API endpoints
   */
  auth = {
    // User registration
    register: (userData) => this.client.post('/auth/register', userData),
    
    // User login
    login: (credentials) => this.client.post('/auth/login', credentials),
    
    // Get current user
    getMe: () => this.client.get('/auth/me'),
    
    // Update user profile
    updateProfile: (userData) => this.client.put('/auth/me', userData),
    
    // Logout
    logout: () => this.client.post('/auth/logout'),
    
    // Connect cloud accounts using OAuth tokens from mobile
    connectAWS: (tokenData) => this.client.post('/auth/connect/aws', tokenData),
    connectAzure: (tokenData) => this.client.post('/auth/connect/azure', tokenData),
    connectGCP: (tokenData) => this.client.post('/auth/connect/gcp', tokenData),
    
    // Refresh OAuth tokens
    refreshToken: (accountId, refreshToken) => this.client.post('/auth/refresh-token', { accountId, refreshToken })
  };

  /**
   * Cloud Accounts API endpoints
   */
  accounts = {
    // Get all connected accounts
    getAll: () => this.client.get('/accounts'),
    
    // Test account connection
    testConnection: (accountId) => this.client.put(`/accounts/${accountId}/test`),
    
    // Remove account connection
    disconnect: (accountId) => this.client.delete(`/accounts/${accountId}`)
  };

  /**
   * Alert API endpoints (Coming in Week 5)
   */
  alerts = {
    // Get all alerts
    getAll: () => this.client.get('/alerts'),
    
    // Configure alerts
    configure: (config) => this.client.post('/alerts/configure', config)
  };

  /**
   * Generic GET request
   */
  get(endpoint, params = {}) {
    return this.client.get(endpoint, { params });
  }

  /**
   * Generic POST request
   */
  post(endpoint, data) {
    return this.client.post(endpoint, data);
  }

  /**
   * Generic PUT request
   */
  put(endpoint, data) {
    return this.client.put(endpoint, data);
  }

  /**
   * Generic DELETE request
   */
  delete(endpoint) {
    return this.client.delete(endpoint);
  }

  /**
   * Set authentication token
   */
  setAuthToken(token) {
    this.authToken = token;
  }

  /**
   * Clear authentication token
   */
  clearAuthToken() {
    this.authToken = null;
  }

  /**
   * Get current auth token
   */
  getAuthToken() {
    return this.authToken;
  }
}

// Export singleton instance
export default new ApiService();