import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';

import { ScreenContainer } from '../components/ScreenContainer';
import { Colors, Radius, Shadows } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';

export function ConfirmCodeScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'ConfirmCode'>>();
  const { verifyEmail, resendVerification } = useAuth();
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
    if (code.trim().length < 6) {
      Alert.alert('Error', 'Enter the code from your email.');
      return;
    }
    setLoading(true);
    try {
      const result = await verifyEmail(email, code);
      if (!result.ok) {
        Alert.alert('Error', result.error ?? 'Invalid confirmation code.');
        return;
      }
      // Verifying the code signs the user in.
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
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
      const result = await resendVerification(email);
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
    <ScreenContainer title="Confirm your email" subtitle="We sent you a confirmation email">
      <View style={styles.group}>
        <Text style={styles.label}>Email</Text>
        <Text style={styles.emailText}>{email}</Text>
      </View>

      <Text style={styles.hintText}>
        Open the email and tap the confirmation link, then come back and sign in. If your email
        contains a code instead, enter it below.
      </Text>

      <Pressable style={styles.primaryButton} onPress={() => navigation.navigate('Login')}>
        <Text style={styles.primaryButtonText}>I've confirmed, sign in</Text>
      </Pressable>

      <View style={styles.group}>
        <Text style={styles.label}>Confirmation code (optional)</Text>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          style={styles.input}
          keyboardType="number-pad"
          maxLength={10}
        />
      </View>

      <Pressable style={styles.secondaryButton} onPress={handleVerify} disabled={loading}>
        <Text style={styles.secondaryButtonText}>{loading ? 'Verifying...' : 'Verify code'}</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={handleResend} disabled={loading}>
        <Text style={styles.secondaryButtonText}>Resend email</Text>
      </Pressable>

      <Text style={styles.expiryText}>Links and codes expire after a while ({expiryLabel})</Text>
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
  hintText: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  emailText: {
    fontSize: 15,
    color: Colors.textPrimary,
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgLight,
    paddingHorizontal: 12,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    ...Shadows.button,
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: '700',
  },
  secondaryButton: {
    height: 46,
    borderRadius: Radius.md,
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
