import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '../context/AuthContext';
import { Colors, Font } from '../constants/theme';
import {
  ErrorText,
  Field,
  FormCard,
  FormHeader,
  Input,
  PrimaryButton,
  SecondaryButton,
  moduleStyles,
} from '../components/module/ModuleUI';

const BIO_LIMIT = 280;

export function EditProfileScreen() {
  const navigation = useNavigation();
  const { user, updateProfile } = useAuth();

  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [city, setCity] = useState(user?.selectedCity ?? '');
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickAvatar = async (fromCamera: boolean) => {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', fromCamera ? 'Allow camera access to take a photo.' : 'Allow photo access to choose a picture.');
      return;
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', allowsEditing: true, aspect: [1, 1], quality: 0.7 };
    const result = fromCamera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;

    setAvatarBusy(true);
    const res = await updateProfile({ avatarImageUri: result.assets[0].uri });
    setAvatarBusy(false);
    if (!res.ok) Alert.alert('Upload failed', res.error ?? 'Could not upload the photo.');
  };

  const changeAvatar = () =>
    Alert.alert('Profile photo', undefined, [
      { text: 'Take photo', onPress: () => pickAvatar(true) },
      { text: 'Choose from gallery', onPress: () => pickAvatar(false) },
      ...(user?.avatarUrl
        ? [
            {
              text: 'Remove photo',
              style: 'destructive' as const,
              onPress: async () => {
                setAvatarBusy(true);
                const res = await updateProfile({ removeAvatar: true });
                setAvatarBusy(false);
                if (!res.ok) Alert.alert('Error', res.error ?? 'Could not remove the photo.');
              },
            },
          ]
        : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);

  const fillCityFromLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location off', 'Allow location access, or type your city.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync(pos.coords);
      const found = place?.city || place?.subregion || place?.region;
      if (found) setCity(found);
      else Alert.alert('Not found', 'Could not work out your city. Please type it.');
    } catch {
      Alert.alert('Location error', 'Could not get your location. Please type your city.');
    } finally {
      setLocating(false);
    }
  };

  const handleSave = async () => {
    setError(null);
    if (!fullName.trim()) {
      setError('Please enter your name.');
      return;
    }
    setSaving(true);
    const res = await updateProfile({ fullName: fullName.trim(), bio: bio.trim(), selectedCity: city.trim() });
    setSaving(false);
    if (res.ok) navigation.goBack();
    else setError(res.error ?? 'Could not update your profile.');
  };

  const initials = (fullName || user?.email || '?')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <SafeAreaView style={moduleStyles.container}>
      <FormHeader title="Edit Profile" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={moduleStyles.formContent} keyboardShouldPersistTaps="handled">
          <View style={styles.avatarWrap}>
            <Pressable onPress={changeAvatar} disabled={avatarBusy}>
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.initials}>{initials}</Text>
                </View>
              )}
              <View style={styles.cameraBadge}>
                {avatarBusy ? <ActivityIndicator size="small" color={Colors.white} /> : <Ionicons name="camera" size={16} color={Colors.white} />}
              </View>
            </Pressable>
            <Text style={moduleStyles.muted}>Tap to change your photo</Text>
          </View>

          <FormCard>
            <Field label="Full name">
              <Input placeholder="Your name" value={fullName} onChangeText={setFullName} maxLength={120} />
            </Field>
            <Field label="Email">
              <Input value={user?.email ?? ''} editable={false} style={{ color: Colors.textSecondary }} />
            </Field>
            <Field label="Bio (optional)" hint={`${bio.length}/${BIO_LIMIT}`}>
              <Input
                placeholder="A few words about you"
                multiline
                value={bio}
                onChangeText={(v) => setBio(v.slice(0, BIO_LIMIT))}
              />
            </Field>
            <Field label="City" hint="Used for weather and prayer times.">
              <Input placeholder="e.g. Lahore" value={city} onChangeText={setCity} />
              <SecondaryButton label={locating ? 'Locating...' : 'Use my location'} icon="locate-outline" onPress={fillCityFromLocation} />
            </Field>
          </FormCard>

          <View style={{ paddingHorizontal: 16, gap: 8 }}>
            <ErrorText text={error} />
            <PrimaryButton label="Save Changes" onPress={handleSave} loading={saving} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  avatarWrap: { alignItems: 'center', gap: 8, marginTop: 4 },
  avatar: { width: 104, height: 104, borderRadius: 52 },
  avatarFallback: { backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: Font.extrabold, fontSize: 34, color: Colors.primary },
  cameraBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.white,
  },
});
