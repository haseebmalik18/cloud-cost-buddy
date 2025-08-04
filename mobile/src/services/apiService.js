import axios from 'axios';
import Constants from 'expo-constants';

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

    this.authToken = null;

    this.client.interceptors.request.use(
      (config) => {
        if (this.authToken) {
          config.headers.Authorization = `Bearer ${this.authToken}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        return Promise.reject(this.handleError(error));
      }
    );
  }

  handleError(error) {
    if (error.response) {
      return {
        message: error.response.data?.message || 'Server error occurred',
        status: error.response.status,
        data: error.response.data
      };
    } else if (error.request) {
      return {
        message: 'Network error - please check your connection',
        status: 0,
        data: null
      };
    } else {
      return {
        message: error.message || 'An unexpected error occurred',
        status: -1,
        data: null
      };
    }
  }

  dashboard = {
    getSummary: () => this.client.get('/dashboard/summary'),
    
    getComparison: (params = {}) => this.client.get('/dashboard/compare', { params }),
    
    getHealth: () => this.client.get('/dashboard/health')
  };

  aws = {
    getAccounts: () => this.client.get('/aws/accounts'),
    
    testConnection: (accountId) => this.client.get(`/aws/accounts/${accountId}/health`),
    
    getCurrentCosts: (params = {}) => this.client.get('/aws/costs/current', { params }),
    
    getTrends: (params) => this.client.get('/aws/costs/trends', { params }),
    
    getTopServices: (params = {}) => this.client.get('/aws/services/top', { params }),
    
    getBudgets: (accountId) => this.client.get('/aws/budgets', { params: { accountId } }),
    
    getForecast: (params = {}) => this.client.get('/aws/forecast', { params }),
    
    getSummary: () => this.client.get('/aws/summary')
  };

  azure = {
    getSubscriptions: () => this.client.get('/azure/subscriptions'),
    
    testConnection: (subscriptionId) => this.client.get(`/azure/subscriptions/${subscriptionId}/health`),
    
    getCurrentCosts: (params = {}) => this.client.get('/azure/costs/current', { params }),
    
    getTrends: (params) => this.client.get('/azure/costs/trends', { params }),
    
    getTopServices: (params = {}) => this.client.get('/azure/services/top', { params }),
    
    getBudgets: (subscriptionId) => this.client.get('/azure/budgets', { params: { subscriptionId } }),
    
    getForecast: (params = {}) => this.client.get('/azure/forecast', { params }),
    
    getSummary: () => this.client.get('/azure/summary')
  };

  gcp = {
    getProjects: () => this.client.get('/gcp/projects'),
    
    testConnection: (projectId) => this.client.get(`/gcp/projects/${projectId}/health`),
    
    getCurrentCosts: (params = {}) => this.client.get('/gcp/costs/current', { params }),
    
    getTrends: (params) => this.client.get('/gcp/costs/trends', { params }),
    
    getTopServices: (params = {}) => this.client.get('/gcp/services/top', { params }),
    
    getBudgets: (projectId) => this.client.get('/gcp/budgets', { params: { projectId } }),
    
    getForecast: (params = {}) => this.client.get('/gcp/forecast', { params }),
    
    getSummary: () => this.client.get('/gcp/summary'),
    
    getBillingAccount: (projectId) => this.client.get('/gcp/billing-account', { params: { projectId } })
  };

  auth = {
    register: (userData) => this.client.post('/auth/register', userData),
    
    login: (credentials) => this.client.post('/auth/login', credentials),
    
    getMe: () => this.client.get('/auth/me'),
    
    updateProfile: (userData) => this.client.put('/auth/me', userData),
    
    logout: () => this.client.post('/auth/logout'),
    
    connectAWS: (tokenData) => this.client.post('/auth/connect/aws', tokenData),
    connectAzure: (tokenData) => this.client.post('/auth/connect/azure', tokenData),
    connectGCP: (tokenData) => this.client.post('/auth/connect/gcp', tokenData),
    
    refreshToken: (accountId, refreshToken) => this.client.post('/auth/refresh-token', { accountId, refreshToken })
  };

  accounts = {
    getAll: () => this.client.get('/accounts'),
    
    addAWS: (accountData) => this.client.post('/accounts/aws', accountData),
    
    addAzure: (subscriptionData) => this.client.post('/accounts/azure', subscriptionData),
    
    addGCP: (projectData) => this.client.post('/accounts/gcp', projectData),
    
    testConnection: (accountId) => this.client.put(`/accounts/${accountId}/test`),
    
    removeAccount: (accountId) => this.client.delete(`/accounts/${accountId}`)
  };

  alerts = {
    getAll: () => this.client.get('/alerts'),
    
    configure: (config) => this.client.post('/alerts/configure', config)
  };

  get(endpoint, params = {}) {
    return this.client.get(endpoint, { params });
  }

  post(endpoint, data) {
    return this.client.post(endpoint, data);
  }

  put(endpoint, data) {
    return this.client.put(endpoint, data);
  }

  delete(endpoint) {
    return this.client.delete(endpoint);
  }

  setAuthToken(token) {
    this.authToken = token;
  }

  clearAuthToken() {
    this.authToken = null;
  }

  getAuthToken() {
    return this.authToken;
  }
}

export default new ApiService();