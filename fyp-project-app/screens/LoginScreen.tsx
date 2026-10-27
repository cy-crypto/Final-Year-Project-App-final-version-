import React, { useEffect, useState } from 'react';
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
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { requestPasswordReset, resetPassword } from '../services/authService';

export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Login'>>();
  const { login } = useAuth();

  const [email, setEmail] = useState(route.params?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  // Prefill the email when arriving from a freshly created account
  useEffect(() => {
    if (route.params?.email) {
      setEmail(route.params.email);
      setPassword('');
    }
  }, [route.params?.email]);

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.needsVerification) {
        navigation.navigate('ConfirmCode', { email: email.trim().toLowerCase() });
      } else if (!result.ok) {
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
            <MaterialCommunityIcons name="leaf" size={32} color={Colors.white} />
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
              <Ionicons name="mail-outline" size={20} color={Colors.textHint} style={{ marginLeft: 2 }} />
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
              <Ionicons name="lock-closed-outline" size={20} color={Colors.textHint} style={{ marginLeft: 2 }} />
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
                  size={20} 
                  color={Colors.textHint} 
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
                  <Ionicons name="mail-outline" size={20} color={Colors.textHint} style={{ marginLeft: 2 }} />
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
                  <Ionicons name="key-outline" size={20} color={Colors.textHint} style={{ marginLeft: 2 }} />
                  <TextInput
                    style={styles.textInput}
                    value={resetCode}
                    onChangeText={setResetCode}
                    keyboardType="number-pad"
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
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.textHint} style={{ marginLeft: 2 }} />
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
    marginBottom: 32,
  },
  iconContainer: {
    width: 76,
    height: 76,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    ...Shadows.button,
  },
  appName: {
    fontSize: 32,
    fontFamily: Font.extrabold,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 16,
    fontFamily: Font.medium,
    color: Colors.textSecondary,
  },

  // Form Section
  formSection: {
    gap: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 22,
    ...Shadows.card,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 15,
    fontFamily: Font.bold,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    padding: 10,
    paddingHorizontal: 12,
    height: 58,
    gap: 10,
  },
  textInput: {
    fontFamily: Font.regular,
    fontSize: 18,
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
    fontSize: 16,
    fontFamily: Font.bold,
    color: Colors.primary,
  },

  // Sign In Button
  signInButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    ...Shadows.button,
  },
  signInButtonDisabled: {
    opacity: 0.7,
  },
  signInButtonText: {
    fontSize: 18,
    fontFamily: Font.bold,
    color: Colors.white,
  },


  // Signup Link
  signupContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signupText: {
    fontFamily: Font.regular,
    fontSize: 16,
    color: Colors.textHint,
  },
  signupLink: {
    fontSize: 16,
    color: Colors.primary,
    fontFamily: Font.bold,
  },
  resetPanel: {
    marginTop: 0,
    padding: 16,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    gap: 10,
    ...Shadows.card,
  },
  resetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  resetTitle: {
    fontSize: 19,
    fontFamily: Font.semibold,
    color: Colors.textPrimary,
  },
  resetSubtitle: {
    fontFamily: Font.regular,
    fontSize: 16,
    color: Colors.textSecondary,
  },
  resetActionButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.button,
  },
  resetActionText: {
    color: Colors.white,
    fontFamily: Font.semibold,
    fontSize: 16,
  },
  resetActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  resetSecondaryButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
  },
  resetSecondaryText: {
    color: Colors.textSecondary,
    fontFamily: Font.semibold,
    fontSize: 16,
  },
});
