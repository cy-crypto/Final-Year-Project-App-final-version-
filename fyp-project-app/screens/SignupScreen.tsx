import { useFieldChain } from '../hooks/useFieldChain';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NavigationProp } from '@react-navigation/native';

import { Colors, Radius, Shadows } from '../constants/theme';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';

export function SignupScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { signup } = useAuth();

  const field = useFieldChain(4, () => handleSignup());

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const result = await signup(email, password, fullName);
      if (!result.ok) {
        setError(result.error ?? 'Unable to create account.');
        return;
      }

      if (result.needsVerification) {
        navigation.navigate('ConfirmCode', { email: email.trim().toLowerCase() });
      } else {
        navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    Alert.alert('Google Sign Up', 'Coming soon.');
  };

  const handleAppleSignUp = async () => {
    Alert.alert('Apple Sign Up', 'Coming soon.');
  };

  return (
    <ScreenContainer title="Create your account" subtitle="">
      <View style={styles.group}>
        <Text style={styles.label}>Full name</Text>
        <TextInput {...field(0)}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Noman Shabbir"
          style={styles.input}
          maxFontSizeMultiplier={1.2}
          placeholderTextColor={Colors.textHint}
        />
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Email address</Text>
        <TextInput {...field(1)}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="you@example.com"
          style={styles.input}
          maxFontSizeMultiplier={1.2}
          placeholderTextColor={Colors.textHint}
        />
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Password</Text>
        <TextInput {...field(2)}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          style={styles.input}
          maxFontSizeMultiplier={1.2}
          placeholderTextColor={Colors.textHint}
        />
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Confirm Password</Text>
        <TextInput {...field(3)}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          placeholder="••••••••"
          style={styles.input}
          maxFontSizeMultiplier={1.2}
          placeholderTextColor={Colors.textHint}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.primaryButton} onPress={handleSignup} disabled={loading}>
        <Text style={styles.primaryButtonText}>{loading ? 'Creating...' : 'Create account'}</Text>
      </Pressable>

      <View style={styles.dividerContainer}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.socialButtonsContainer}>
        <Pressable style={styles.socialButton} onPress={handleGoogleSignUp}>
          <Text style={styles.socialButtonText}>Google</Text>
        </Pressable>
        <Pressable style={styles.socialButton} onPress={handleAppleSignUp}>
          <Text style={styles.socialButtonText}>Apple</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => navigation.navigate('Login')}>
        <Text style={styles.secondaryText}>Already have an account? Sign in</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  input: {
    height: 48,
    fontSize: 14,
    color: '#000000',
    paddingVertical: 0,
    textAlignVertical: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgLight,
    paddingHorizontal: 12,
  },
  error: {
    color: Colors.error,
    fontWeight: '600',
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.button,
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: '700',
  },
  secondaryText: {
    textAlign: 'center',
    color: Colors.primary,
    fontWeight: '600',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
  },
  dividerLine: {
    flex: 1,
    height: 0.5,
    backgroundColor: Colors.borderLight,
  },
  dividerText: {
    fontSize: 13,
    color: Colors.textHint,
    marginHorizontal: 8,
  },
  socialButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  socialButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 10,
    height: 38,
  },
  socialButtonText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
});
