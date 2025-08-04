import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import authService from './authService';

/**
 * OAuth Service for cloud provider authentication
 * Implements OAuth 2.0 with PKCE flow for security
 */
class OAuthService {
  constructor() {
    this.currentProvider = null;
    this.discovery = null;
  }

  /**
   * Initiate OAuth flow for cloud provider
   */
  async initiateOAuth(provider) {
    try {
      this.currentProvider = provider;
      
      const config = this.getProviderConfig(provider);
      const request = new AuthSession.AuthRequest({
        clientId: config.clientId,
        scopes: config.scopes,
        redirectUri: AuthSession.makeRedirectUri({
          scheme: 'cloudcostbuddy',
          path: `oauth/${provider}`
        }),
        responseType: AuthSession.ResponseType.Code,
        codeChallenge: await this.generateCodeChallenge(),
        codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
        additionalParameters: config.additionalParameters || {},
        state: this.generateSecureRandom(32)
      });

      const result = await request.promptAsync(config.discovery, {
        showInRecents: true,
        preferEphemeralSession: false
      });

      if (result.type === 'success') {
        return await this.handleAuthSuccess(result, provider, request);
      } else if (result.type === 'cancel') {
        throw new Error('OAuth cancelled by user');
      } else {
        throw new Error(`OAuth failed: ${result.type}`);
      }
    } catch (error) {
      // OAuth error handled by caller
      throw error;
    } finally {
      this.currentProvider = null;
    }
  }

  /**
   * Handle successful OAuth authorization
   */
  async handleAuthSuccess(result, provider, request) {
    try {
      const { code, state } = result.params;
      
      if (!code) {
        throw new Error('No authorization code received');
      }

      // Exchange authorization code for tokens
      const tokenResult = await AuthSession.exchangeCodeAsync(
        {
          clientId: request.clientId,
          code,
          redirectUri: request.redirectUri,
          codeVerifier: request.codeChallenge, // PKCE verifier
        },
        this.getProviderConfig(provider).discovery
      );

      if (!tokenResult.accessToken) {
        throw new Error('No access token received');
      }

      // Connect the cloud account using authService
      const connectionResult = await this.connectCloudAccount(
        provider,
        tokenResult.accessToken,
        tokenResult.refreshToken
      );

      return {
        success: true,
        account: connectionResult.account,
        tokens: {
          accessToken: tokenResult.accessToken,
          refreshToken: tokenResult.refreshToken,
          expiresIn: tokenResult.expiresIn
        }
      };
    } catch (error) {
      // Token exchange error handled by caller
      throw new Error(`Failed to complete OAuth flow: ${error.message}`);
    }
  }

  /**
   * Connect cloud account using backend API
   */
  async connectCloudAccount(provider, accessToken, refreshToken = null) {
    switch (provider?.toLowerCase()) {
      case 'aws':
        return await authService.connectAWS(accessToken);
      case 'azure':
        return await authService.connectAzure(accessToken);
      case 'gcp':
        return await authService.connectGCP(accessToken, refreshToken);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Get OAuth configuration for provider
   */
  getProviderConfig(provider) {
    const config = Constants.expoConfig?.extra;
    
    switch (provider?.toLowerCase()) {
      case 'aws':
        return {
          clientId: config?.awsClientId,
          discovery: AuthSession.makeDiscoveryDocument({
            authorizationEndpoint: `https://${config?.awsCognitoDomain}/oauth2/authorize`,
            tokenEndpoint: `https://${config?.awsCognitoDomain}/oauth2/token`
          }),
          scopes: ['openid', 'email', 'profile'],
          additionalParameters: {}
        };

      case 'azure':
        const tenantId = config?.azureTenantId || 'common';
        return {
          clientId: config?.azureClientId,
          discovery: AuthSession.makeDiscoveryDocument({
            authorizationEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
            tokenEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
          }),
          scopes: ['https://management.azure.com/user_impersonation'],
          additionalParameters: {
            prompt: 'consent'
          }
        };

      case 'gcp':
        return {
          clientId: config?.gcpClientId,
          discovery: AuthSession.makeDiscoveryDocument({
            authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenEndpoint: 'https://oauth2.googleapis.com/token'
          }),
          scopes: [
            'https://www.googleapis.com/auth/cloud-billing',
            'https://www.googleapis.com/auth/cloud-platform.read-only'
          ],
          additionalParameters: {
            access_type: 'offline',
            prompt: 'consent'
          }
        };

      default:
        throw new Error(`Unsupported OAuth provider: ${provider}`);
    }
  }

  /**
   * Validate OAuth configuration for provider
   */
  validateConfiguration(provider) {
    const config = Constants.expoConfig?.extra;
    const errors = [];

    switch (provider?.toLowerCase()) {
      case 'aws':
        if (!config?.awsClientId) {
          errors.push('awsClientId is required in app.json extra configuration');
        }
        if (!config?.awsCognitoDomain) {
          errors.push('awsCognitoDomain is required in app.json extra configuration');
        }
        break;

      case 'azure':
        if (!config?.azureClientId) {
          errors.push('azureClientId is required in app.json extra configuration');
        }
        break;

      case 'gcp':
        if (!config?.gcpClientId) {
          errors.push('gcpClientId is required in app.json extra configuration');
        }
        break;

      default:
        errors.push(`Unsupported provider: ${provider}`);
    }

    if (errors.length > 0) {
      throw new Error(`OAuth configuration errors:\n${errors.join('\n')}`);
    }

    return true;
  }

  /**
   * Generate code challenge for PKCE
   */
  async generateCodeChallenge() {
    const codeVerifier = this.generateSecureRandom(128);
    const challenge = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      codeVerifier,
      { encoding: Crypto.CryptoEncoding.BASE64URL }
    );
    return challenge;
  }

  /**
   * Generate secure random string
   */
  generateSecureRandom(length) {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let result = '';
    const values = new Uint8Array(length);
    
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(values);
      for (let i = 0; i < length; i++) {
        result += charset[values[i] % charset.length];
      }
    } else {
      for (let i = 0; i < length; i++) {
        result += charset[Math.floor(Math.random() * charset.length)];
      }
    }
    
    return result;
  }

  /**
   * Refresh OAuth tokens
   */
  async refreshTokens(provider, refreshToken) {
    try {
      const config = this.getProviderConfig(provider);
      
      const tokenResult = await AuthSession.refreshAsync(
        {
          clientId: config.clientId,
          refreshToken
        },
        config.discovery
      );

      return {
        success: true,
        tokens: {
          accessToken: tokenResult.accessToken,
          refreshToken: tokenResult.refreshToken || refreshToken,
          expiresIn: tokenResult.expiresIn
        }
      };
    } catch (error) {
      // Token refresh error handled by caller
      throw new Error(`Failed to refresh tokens: ${error.message}`);
    }
  }

  /**
   * Get supported providers
   */
  getSupportedProviders() {
    return [
      {
        id: 'aws',
        name: 'Amazon Web Services',
        description: 'Access AWS Cost Explorer, Budgets, and usage data',
        scopes: ['Cost monitoring', 'Budget management', 'Usage reports'],
        requiresConfiguration: ['awsClientId', 'awsCognitoDomain']
      },
      {
        id: 'azure',
        name: 'Microsoft Azure',
        description: 'Monitor Azure subscriptions and cost management',
        scopes: ['Cost management', 'Subscription access', 'Resource monitoring'],
        requiresConfiguration: ['azureClientId']
      },
      {
        id: 'gcp',
        name: 'Google Cloud Platform',
        description: 'Track GCP billing and project costs',
        scopes: ['Cloud billing', 'Project monitoring', 'Resource usage'],
        requiresConfiguration: ['gcpClientId']
      }
    ];
  }

  /**
   * Check if provider is properly configured
   */
  isProviderConfigured(provider) {
    try {
      this.validateConfiguration(provider);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get configuration status for all providers
   */
  getConfigurationStatus() {
    const providers = this.getSupportedProviders();
    return providers.map(provider => ({
      ...provider,
      configured: this.isProviderConfigured(provider.id),
      configurationErrors: this.isProviderConfigured(provider.id) 
        ? [] 
        : this.getConfigurationErrors(provider.id)
    }));
  }

  /**
   * Get specific configuration errors for provider
   */
  getConfigurationErrors(provider) {
    try {
      this.validateConfiguration(provider);
      return [];
    } catch (error) {
      return error.message.split('\n').filter(line => line.startsWith('OAuth configuration errors:') === false);
    }
  }
}

// Export singleton instance
export default new OAuthService();