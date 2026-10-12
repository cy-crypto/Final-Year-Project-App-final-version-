import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { requestPasswordReset, resetPassword } from '../services/authService';

export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await login(email, password);
      if (!result.ok) {
        Alert.alert('Login Failed', result.error ?? 'Unable to login.');
      } else {
        console.log('Login function called, navigating...');
        navigation.replace('MainTabs');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    setResetEmail(email.trim());
    setShowReset(true);
  };

  const handleSendResetCode = async () => {
    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    setResetLoading(true);
    try {
      const result = await requestPasswordReset(cleanEmail);
      Alert.alert('Reset Code Sent', result.detail ?? 'If the account exists, a reset code was sent.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send reset code.';
      Alert.alert('Reset Failed', message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetPassword = async () => {
    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }
    if (!resetCode.trim()) {
      Alert.alert('Missing Code', 'Enter the reset code sent to your email.');
      return;
    }
    if (resetPasswordValue.length < 8) {
      Alert.alert('Weak Password', 'Password must be at least 8 characters.');
      return;
    }

    setResetLoading(true);
    try {
      const result = await resetPassword(cleanEmail, resetCode.trim(), resetPasswordValue);
      Alert.alert('Password Updated', result.detail ?? 'You can now log in with the new password.');
      setShowReset(false);
      setResetCode('');
      setResetPasswordValue('');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to reset password.';
      Alert.alert('Reset Failed', message);
    } finally {
      setResetLoading(false);
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* SECTION 1 — APP LOGO */}
        <View style={styles.logoSection}>
          <View style={styles.iconContainer}>
            <MaterialCommunityIcons name="leaf" size={22} color={Colors.white} />
          </View>
          <Text style={styles.appName}>Personal Companion</Text>
          <Text style={styles.tagline}>Your daily life, simplified</Text>
        </View>

        {/* SECTION 2 — INPUT FIELDS */}
        <View style={styles.formSection}>
          {/* Email Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Email address</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="mail-outline" size={15} color={Colors.textHint} style={{ marginLeft: 2 }} />
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                placeholder="you@example.com"
                placeholderTextColor={Colors.textHint}
                textAlign="left"
                textAlignVertical="center"
              />
            </View>
          </View>

          {/* Password Field */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="lock-closed-outline" size={15} color={Colors.textHint} style={{ marginLeft: 2 }} />
              <TextInput
                style={styles.textInput}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                placeholder="••••••••"
                placeholderTextColor={Colors.textHint}
                textAlign="left"
                textAlignVertical="center"
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={{ marginRight: 2 }}>
                <Ionicons 
                  name={showPassword ? "eye-off-outline" : "eye-outline"} 
                  size={15} 
                  color={Colors.borderLight} 
                />
              </Pressable>
            </View>
          </View>

          {/* Forgot Password */}
          <Pressable style={styles.forgotPasswordContainer} onPress={handleForgotPassword}>
            <Text style={styles.forgotPasswordText}>Forgot password?</Text>
          </Pressable>

          {/* SECTION 3 — SIGN IN BUTTON */}
          <Pressable 
            style={[styles.signInButton, loading && styles.signInButtonDisabled]} 
            onPress={handleLogin}
            disabled={loading}
          >
            <Text style={styles.signInButtonText}>
              {loading ? 'Signing in...' : 'Sign in'}
            </Text>
          </Pressable>


          {/* SECTION 6 — SIGNUP LINK */}
          <View style={styles.signupContainer}>
            <Text style={styles.signupText}>Don't have an account? </Text>
            <Pressable onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.signupLink}>Sign up</Text>
            </Pressable>
          </View>
        </View>

        <Modal
          visible={showReset}
          transparent
          animationType="slide"
          onRequestClose={() => setShowReset(false)}>
          <View style={styles.resetOverlay}>
            <View style={styles.resetPanel}>
              <Text style={styles.resetTitle}>Reset Password</Text>
              <Text style={styles.resetSubtitle}>Enter your email to receive a code.</Text>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Email address</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={15} color={Colors.textHint} style={{ marginLeft: 2 }} />
                  <TextInput
                    style={styles.textInput}
                    value={resetEmail}
                    onChangeText={setResetEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholder="you@example.com"
                    placeholderTextColor={Colors.textHint}
                    textAlign="left"
                    textAlignVertical="center"
                  />
                </View>
              </View>

              <Pressable style={styles.resetActionButton} onPress={handleSendResetCode} disabled={resetLoading}>
                <Text style={styles.resetActionText}>{resetLoading ? 'Sending...' : 'Send Code'}</Text>
              </Pressable>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Reset code</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="key-outline" size={15} color={Colors.textHint} style={{ marginLeft: 2 }} />
                  <TextInput
                    style={styles.textInput}
                    value={resetCode}
                    onChangeText={setResetCode}
                    placeholder="123456"
                    placeholderTextColor={Colors.textHint}
                    textAlign="left"
                    textAlignVertical="center"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>New password</Text>
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={15} color={Colors.textHint} style={{ marginLeft: 2 }} />
                  <TextInput
                    style={styles.textInput}
                    value={resetPasswordValue}
                    onChangeText={setResetPasswordValue}
                    secureTextEntry
                    placeholder="••••••••"
                    placeholderTextColor={Colors.textHint}
                    textAlign="left"
                    textAlignVertical="center"
                  />
                </View>
              </View>

              <View style={styles.resetActionsRow}>
                <Pressable style={styles.resetSecondaryButton} onPress={() => setShowReset(false)}>
                  <Text style={styles.resetSecondaryText}>Close</Text>
                </Pressable>
                <Pressable style={styles.resetActionButton} onPress={handleResetPassword} disabled={resetLoading}>
                  <Text style={styles.resetActionText}>{resetLoading ? 'Updating...' : 'Reset Password'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  
  // Logo Section
  logoSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  appName: {
    fontSize: 22,
    fontWeight: '500',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  tagline: {
    fontSize: 14,
    color: Colors.textHint,
  },

  // Form Section
  formSection: {
    gap: 12,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 10,
    padding: 10,
    paddingHorizontal: 12,
    height: 42,
    gap: 8,
  },
  textInput: {
    fontSize: 15,
    color: '#000000',
    flex: 1,
    padding: 0,
    margin: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
  },

  // Forgot Password
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  forgotPasswordText: {
    fontSize: 13,
    color: Colors.primary,
  },

  // Sign In Button
  signInButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  signInButtonDisabled: {
    opacity: 0.7,
  },
  signInButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.white,
  },


  // Signup Link
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupText: {
    fontSize: 13,
    color: Colors.textHint,
  },
  signupLink: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '500',
  },
  resetPanel: {
    marginTop: 0,
    padding: 16,
    borderRadius: 14,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    gap: 10,
  },
  resetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  resetTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  resetSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  resetActionButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetActionText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 13,
  },
  resetActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  resetSecondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 10,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
  },
  resetSecondaryText: {
    color: Colors.textSecondary,
    fontWeight: '600',
    fontSize: 13,
  },
});
