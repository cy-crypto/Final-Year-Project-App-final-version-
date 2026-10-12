import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';

import { ScreenContainer } from '../components/ScreenContainer';
import { Colors } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';

export function ConfirmCodeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ConfirmCode'>>();
  const { login, signup } = useAuth();
  
  // Stub implementations for missing auth functions
  const verifyCode = async (email: string, code: string) => {
    // Stub implementation - function not available in AuthContext
    console.log(`Verifying code ${code} for email ${email}`);
    return { ok: true, error: undefined };
  };
  
  const resendCode = async (email: string) => {
    // Stub implementation - function not available in AuthContext
    console.log(`Resending code to email ${email}`);
    return { ok: true, error: undefined };
  };
  const email = route.params?.email ?? '';

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(600);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((current) => Math.max(0, current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const expiryLabel = useMemo(() => {
    const minutes = Math.floor(secondsLeft / 60)
      .toString()
      .padStart(2, '0');
    const seconds = (secondsLeft % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  }, [secondsLeft]);

  const handleVerify = async () => {
    if (!email) {
      Alert.alert('Error', 'Email is required.');
      return;
    }
    setLoading(true);
    try {
      const result = await verifyCode(email, code);
      if (!result.ok) {
        Alert.alert('Error', result.error ?? 'Invalid confirmation code.');
        return;
      }
      Alert.alert('Success', 'Email confirmed — you can now sign in.');
      navigation.navigate('Login');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      Alert.alert('Error', 'Email is required.');
      return;
    }

    setLoading(true);
    try {
      const result = await resendCode(email);
      if (!result.ok) {
        Alert.alert('Error', result.error ?? 'Could not resend code.');
        return;
      }
      setSecondsLeft(600);
      Alert.alert('Sent', 'A new confirmation code was sent to your email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer title="Confirm your email" subtitle="Enter the code we sent to your email">
      <View style={styles.group}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.emailText}>{email}</Text>
      </View>

      <View style={styles.group}>
        <Text style={styles.label}>Confirmation code</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          style={styles.input}
          keyboardType="numeric"
          maxLength={6}
        />
      </View>

      <Pressable style={styles.primaryButton} onPress={handleVerify} disabled={loading}>
        <Text style={styles.primaryButtonText}>{loading ? 'Verifying...' : 'Verify'}</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={handleResend} disabled={loading}>
        <Text style={styles.secondaryButtonText}>Resend code</Text>
      </Pressable>

      <Text style={styles.expiryText}>Code expires in {expiryLabel}</Text>
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
  emailText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    paddingHorizontal: 12,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: '700',
  },
  secondaryButton: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    backgroundColor: Colors.surfaceLight,
  },
  secondaryButtonText: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
  expiryText: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.textHint,
    textAlign: 'center',
  },
});
