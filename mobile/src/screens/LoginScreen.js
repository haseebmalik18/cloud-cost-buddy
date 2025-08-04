import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  Card,
  Divider,
  useTheme,
  Snackbar
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import authService from '../services/authService';

/**
 * Login Screen
 * Handles user authentication and registration
 */
const LoginScreen = ({ navigation }) => {
  const theme = useTheme();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    confirmPassword: ''
  });

  // Form validation
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};

    // Email validation
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    // Password validation
    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (!isLogin && formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    // Registration-specific validation
    if (!isLogin) {
      if (!formData.firstName) {
        newErrors.firstName = 'First name is required';
      }
      if (!formData.lastName) {
        newErrors.lastName = 'Last name is required';
      }
      if (!formData.confirmPassword) {
        newErrors.confirmPassword = 'Please confirm password';
      } else if (formData.password !== formData.confirmPassword) {
        newErrors.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        // Login
        const result = await authService.login({
          email: formData.email,
          password: formData.password
        });

        if (result.success) {
          setSnackbarMessage('Login successful!');
          setSnackbarVisible(true);
          // Navigation will be handled by the auth state change
        }
      } else {
        // Register
        const result = await authService.register({
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName
        });

        if (result.success) {
          setSnackbarMessage('Registration successful!');
          setSnackbarVisible(true);
          // Navigation will be handled by the auth state change
        }
      }
    } catch (error) {
      // console.error('Auth error:', error);
      setSnackbarMessage(error.message || 'Authentication failed');
      setSnackbarVisible(true);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setFormData({
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      confirmPassword: ''
    });
    setErrors({});
  };

  const updateFormData = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Icon
            name="cloud-outline"
            size={60}
            color={theme.colors.primary}
          />
          <Text variant="headlineMedium" style={styles.title}>
            CloudCost Buddy
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Monitor your multi-cloud spending
          </Text>
        </View>

        <Card style={styles.formCard}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.formTitle}>
              {isLogin ? 'Sign In' : 'Create Account'}
            </Text>

            <View style={styles.form}>
              {/* Registration fields */}
              {!isLogin && (
                <>
                  <TextInput
                    label="First Name"
                    value={formData.firstName}
                    onChangeText={(value) => updateFormData('firstName', value)}
                    error={!!errors.firstName}
                    mode="outlined"
                    style={styles.input}
                    left={<TextInput.Icon icon="account" />}
                  />
                  {errors.firstName && (
                    <Text style={styles.errorText}>{errors.firstName}</Text>
                  )}

                  <TextInput
                    label="Last Name"
                    value={formData.lastName}
                    onChangeText={(value) => updateFormData('lastName', value)}
                    error={!!errors.lastName}
                    mode="outlined"
                    style={styles.input}
                    left={<TextInput.Icon icon="account" />}
                  />
                  {errors.lastName && (
                    <Text style={styles.errorText}>{errors.lastName}</Text>
                  )}
                </>
              )}

              {/* Email */}
              <TextInput
                label="Email"
                value={formData.email}
                onChangeText={(value) => updateFormData('email', value)}
                error={!!errors.email}
                mode="outlined"
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                left={<TextInput.Icon icon="email" />}
              />
              {errors.email && (
                <Text style={styles.errorText}>{errors.email}</Text>
              )}

              {/* Password */}
              <TextInput
                label="Password"
                value={formData.password}
                onChangeText={(value) => updateFormData('password', value)}
                error={!!errors.password}
                mode="outlined"
                style={styles.input}
                secureTextEntry
                left={<TextInput.Icon icon="lock" />}
              />
              {errors.password && (
                <Text style={styles.errorText}>{errors.password}</Text>
              )}

              {/* Confirm Password (Registration only) */}
              {!isLogin && (
                <>
                  <TextInput
                    label="Confirm Password"
                    value={formData.confirmPassword}
                    onChangeText={(value) => updateFormData('confirmPassword', value)}
                    error={!!errors.confirmPassword}
                    mode="outlined"
                    style={styles.input}
                    secureTextEntry
                    left={<TextInput.Icon icon="lock-check" />}
                  />
                  {errors.confirmPassword && (
                    <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                  )}
                </>
              )}

              {/* Submit Button */}
              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={loading}
                disabled={loading}
                style={styles.submitButton}
                contentStyle={styles.submitButtonContent}
              >
                {isLogin ? 'Sign In' : 'Create Account'}
              </Button>

              {/* Toggle Mode */}
              <Divider style={styles.divider} />
              
              <Button
                mode="text"
                onPress={toggleMode}
                disabled={loading}
                style={styles.toggleButton}
              >
                {isLogin 
                  ? "Don't have an account? Sign Up" 
                  : "Already have an account? Sign In"
                }
              </Button>
            </View>
          </Card.Content>
        </Card>

        <View style={styles.footer}>
          <Text variant="bodySmall" style={styles.footerText}>
            Secure multi-cloud cost monitoring
          </Text>
          <Text variant="bodySmall" style={styles.footerText}>
            AWS • Azure • Google Cloud
          </Text>
        </View>
      </ScrollView>

      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={4000}
      >
        {snackbarMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 20
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20
  },
  title: {
    fontWeight: 'bold',
    marginTop: 16,
    textAlign: 'center'
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.7
  },
  formCard: {
    elevation: 4,
    marginBottom: 24
  },
  formTitle: {
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: 'bold'
  },
  form: {
    gap: 16
  },
  input: {
    backgroundColor: 'transparent'
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 12,
    marginTop: -12,
    marginLeft: 16
  },
  submitButton: {
    marginTop: 8
  },
  submitButtonContent: {
    paddingVertical: 8
  },
  divider: {
    marginVertical: 16
  },
  toggleButton: {
    alignSelf: 'center'
  },
  footer: {
    alignItems: 'center',
    marginTop: 24
  },
  footerText: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 4
  }
});

export default LoginScreen;