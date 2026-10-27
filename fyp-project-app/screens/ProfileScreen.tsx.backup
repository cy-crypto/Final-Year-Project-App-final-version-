import React, { useEffect, useState, useMemo } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { Colors } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { api, parseJsonData } from '../services/api';

export function ProfileScreen() {
  const { user, updateProfile, logout } = useAuth();

  const [fullName, setFullName] = useState('');
  const [avatarImageUri, setAvatarImageUri] = useState<string | null>(null);
  const [bio, setBio] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFullName(user?.fullName ?? '');
    setAvatarImageUri(null);
    setBio(user?.bio ?? '');
    setSelectedCity(user?.selectedCity ?? '');
    setError(null);
    setSuccess(null);
  }, [user]);

  const pickImage = async () => {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Please allow photo library access to upload a profile image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      setAvatarImageUri(result.assets[0]?.uri ?? null);
    }
  };

  const handleSave = async () => {
    setError(null);
    setSuccess(null);

    const normalizedName = fullName.trim();
    const normalizedBio = bio.trim();
    const normalizedSelectedCity = selectedCity.trim();

    const hasChanges =
      normalizedName !== (user?.fullName ?? '') ||
      normalizedBio !== (user?.bio ?? '') ||
      normalizedSelectedCity !== (user?.selectedCity ?? '') ||
      Boolean(avatarImageUri);

    if (!hasChanges) {
      setSuccess('No changes to save.');
      return;
    }

    setSaving(true);

    try {
      let result;

      if (avatarImageUri) {
        // Use FormData for image upload
        const formData = new FormData();
        formData.append('full_name', normalizedName);
        formData.append('bio', normalizedBio);
        formData.append('selected_city', normalizedSelectedCity);

        const filename = avatarImageUri.split('/').pop() || 'avatar.jpg';
        const match = /\.(\w+)$/.exec(filename);
        const type = match ? `image/${match[1]}` : 'image/jpeg';
        
        formData.append('avatar_image', {
          uri: avatarImageUri,
          name: filename,
          type: type,
        } as any);

        const response = await api.patch('/auth/profile/', formData);
        const payload = parseJsonData<any>(response.data);
        result = { ok: true, payload };
      } else {
        // Use regular updateProfile for text-only changes
        result = await updateProfile({
          fullName: normalizedName,
          bio: normalizedBio,
          selectedCity: normalizedSelectedCity,
        });
      }

      if (!result.ok) {
        setError(result.error ?? 'Could not save profile.');
        return;
      }

      setSuccess('Profile updated!');
      setAvatarImageUri(null);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => logout(),
        },
      ]
    );
  };

  const profileComplete = useMemo(() => {
    return Math.round(
      ([fullName, bio, selectedCity, user?.avatarUrl]
        .filter(Boolean).length / 4) * 100
    );
  }, [fullName, bio, selectedCity, user?.avatarUrl]);

  const getUserInitial = () => {
    return user?.fullName?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'U';
  };

  const avatarSource = avatarImageUri || user?.avatarUrl;
  const memberSinceYear = '2024'; // You could extract this from user creation date if available

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Profile Header Section */}
      <View style={styles.headerSection}>
        <View style={styles.avatarContainer}>
          {avatarSource ? (
            <Image source={{ uri: avatarSource }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarPlaceholder]}>
              <Text style={styles.avatarInitial}>{getUserInitial()}</Text>
            </View>
          )}
        </View>
        <Text style={styles.userName}>{user?.fullName || 'User'}</Text>
        <Text style={styles.userEmail}>{user?.email}</Text>
        <Pressable style={styles.editPhotoButton} onPress={pickImage}>
          <Text style={styles.editPhotoText}>Edit Photo</Text>
        </Pressable>
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>2024</Text>
          <Text style={styles.statLabel}>Member Since</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValueVerified}>✓ Verified</Text>
          <Text style={styles.statLabel}>Email Verified</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profileComplete}%</Text>
          <Text style={styles.statLabel}>Profile Complete</Text>
        </View>
      </View>

      {/* Edit Profile Form Section */}
      <View style={styles.formCard}>
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Full Name</Text>
          <TextInput
            value={fullName}
            onChangeText={setFullName}
            style={styles.input}
            placeholder="Enter your full name"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            value={bio}
            onChangeText={setBio}
            style={[styles.input, styles.textarea]}
            multiline
            placeholder="Tell us about yourself"
            textAlignVertical="top"
          />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Selected City</Text>
          <TextInput
            value={selectedCity}
            onChangeText={setSelectedCity}
            style={styles.input}
            placeholder="Enter your city"
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {success ? <Text style={styles.success}>{success}</Text> : null}

        <Pressable style={styles.saveButton} onPress={handleSave} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Profile'}</Text>
        </Pressable>
      </View>

      {/* Account Info Section */}
      <View style={styles.accountInfo}>
        <Text style={styles.accountInfoText}>User ID: {user?.userId?.substring(0, 8) || 'Unknown'}</Text>
        <Text style={styles.accountInfoText}>v1.0.0</Text>
      </View>

      {/* Logout Button */}
      <View style={styles.logoutContainer}>
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#eef2f7',
  },
  headerSection: {
    backgroundColor: Colors.primary,
    paddingTop: 60,
    paddingBottom: 30,
    alignItems: 'center',
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  avatarPlaceholder: {
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.primary,
  },
  userName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  userEmail: {
    color: '#ffffff',
    fontSize: 13,
    opacity: 0.8,
    marginBottom: 12,
  },
  editPhotoButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  editPhotoText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    marginTop: -20,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  statValueVerified: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    marginHorizontal: 16,
    padding: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#f9fafb',
    color: '#111827',
  },
  textarea: {
    height: 80,
    paddingTop: 12,
  },
  error: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  success: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  accountInfo: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 16,
  },
  accountInfoText: {
    fontSize: 12,
    color: '#9ca3af',
    marginBottom: 2,
  },
  logoutContainer: {
    paddingHorizontal: 16,
    marginBottom: 60,
  },
  logoutButton: {
    backgroundColor: '#e53935',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
