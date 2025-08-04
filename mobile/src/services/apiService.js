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
    // Get all AWS accounts
    getAccounts: () => this.client.get('/aws/accounts'),
    
    // Test specific account connection
    testConnection: (accountId) => this.client.get(`/aws/accounts/${accountId}/health`),
    
    // Get current month costs (all accounts or specific account)
    getCurrentCosts: (params = {}) => this.client.get('/aws/costs/current', { params }),
    
    // Get cost trends (all accounts or specific account)
    getTrends: (params) => this.client.get('/aws/costs/trends', { params }),
    
    // Get top services (all accounts or specific account)
    getTopServices: (params = {}) => this.client.get('/aws/services/top', { params }),
    
    // Get budgets (requires accountId)
    getBudgets: (accountId) => this.client.get('/aws/budgets', { params: { accountId } }),
    
    // Get forecast (all accounts or specific account)
    getForecast: (params = {}) => this.client.get('/aws/forecast', { params }),
    
    // Get summary (aggregated across all accounts)
    getSummary: () => this.client.get('/aws/summary')
  };

  /**
   * Azure API endpoints
   */
  azure = {
    // Get all Azure subscriptions
    getSubscriptions: () => this.client.get('/azure/subscriptions'),
    
    // Test specific subscription connection
    testConnection: (subscriptionId) => this.client.get(`/azure/subscriptions/${subscriptionId}/health`),
    
    // Get current month costs (all subscriptions or specific subscription)
    getCurrentCosts: (params = {}) => this.client.get('/azure/costs/current', { params }),
    
    // Get cost trends (all subscriptions or specific subscription)
    getTrends: (params) => this.client.get('/azure/costs/trends', { params }),
    
    // Get top services (all subscriptions or specific subscription)
    getTopServices: (params = {}) => this.client.get('/azure/services/top', { params }),
    
    // Get budgets (requires subscriptionId)
    getBudgets: (subscriptionId) => this.client.get('/azure/budgets', { params: { subscriptionId } }),
    
    // Get forecast (all subscriptions or specific subscription)
    getForecast: (params = {}) => this.client.get('/azure/forecast', { params }),
    
    // Get summary (aggregated across all subscriptions)
    getSummary: () => this.client.get('/azure/summary')
  };

  /**
   * GCP API endpoints
   */
  gcp = {
    // Get all GCP projects
    getProjects: () => this.client.get('/gcp/projects'),
    
    // Test specific project connection
    testConnection: (projectId) => this.client.get(`/gcp/projects/${projectId}/health`),
    
    // Get current month costs (all projects or specific project)
    getCurrentCosts: (params = {}) => this.client.get('/gcp/costs/current', { params }),
    
    // Get cost trends (all projects or specific project)
    getTrends: (params) => this.client.get('/gcp/costs/trends', { params }),
    
    // Get top services (all projects or specific project)
    getTopServices: (params = {}) => this.client.get('/gcp/services/top', { params }),
    
    // Get budgets (requires projectId)
    getBudgets: (projectId) => this.client.get('/gcp/budgets', { params: { projectId } }),
    
    // Get forecast (all projects or specific project)
    getForecast: (params = {}) => this.client.get('/gcp/forecast', { params }),
    
    // Get summary (aggregated across all projects)
    getSummary: () => this.client.get('/gcp/summary'),
    
    // Get billing account info (requires projectId)
    getBillingAccount: (projectId) => this.client.get('/gcp/billing-account', { params: { projectId } })
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
    
    // Add AWS account
    addAWS: (accountData) => this.client.post('/accounts/aws', accountData),
    
    // Add Azure subscription
    addAzure: (subscriptionData) => this.client.post('/accounts/azure', subscriptionData),
    
    // Add GCP project
    addGCP: (projectData) => this.client.post('/accounts/gcp', projectData),
    
    // Test account connection
    testConnection: (accountId) => this.client.put(`/accounts/${accountId}/test`),
    
    // Remove account connection
    removeAccount: (accountId) => this.client.delete(`/accounts/${accountId}`)
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