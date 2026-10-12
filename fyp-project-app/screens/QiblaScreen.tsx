import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Pressable,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Location from 'expo-location';
import { Magnetometer } from 'expo-sensors';
import { Colors } from '../constants/theme';

const { width: screenWidth } = Dimensions.get('window');

export function QiblaScreen() {
  const navigation = useNavigation();
  const [location, setLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [qiblaAngle, setQiblaAngle] = useState<number | null>(null);
  const [compassHeading, setCompassHeading] = useState(0);
  const [magnetometerAvailable, setMagnetometerAvailable] = useState(true);

  useEffect(() => {
    requestLocationPermission();
    
    // Check if magnetometer is available
    const subscription = Magnetometer.addListener(() => {});
    subscription.remove();
    
    Magnetometer.isAvailableAsync().then((result) => {
      setMagnetometerAvailable(result);
    });
    
    return () => {
      Magnetometer.removeAllListeners();
    };
  }, []);

  useEffect(() => {
    let subscription: any;
    
    if (magnetometerAvailable) {
      subscription = Magnetometer.addListener((data) => {
        const heading = Math.atan2(data.y, data.x) * (180 / Math.PI);
        setCompassHeading((heading + 360) % 360);
      });
      
      Magnetometer.setUpdateInterval(100);
    }
    
    return () => {
      if (subscription) {
        subscription.remove();
      }
    };
  }, [magnetometerAvailable]);

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        getCurrentLocation();
      } else {
        setLocationError('Location permission denied. Cannot calculate Qibla direction.');
        setLoading(false);
      }
    } catch (error) {
      setLocationError('Failed to get location permission.');
      setLoading(false);
    }
  };

  const getCurrentLocation = async () => {
    try {
      const currentPosition = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = currentPosition.coords;
      setLocation({ latitude, longitude });
      
      // Calculate Qibla angle
      const angle = calculateQiblaAngle(latitude, longitude);
      setQiblaAngle(angle);
      
      setLoading(false);
    } catch (error) {
      setLocationError('Failed to get location. Cannot calculate Qibla direction.');
      setLoading(false);
    }
  };

  const calculateQiblaAngle = (latitude: number, longitude: number) => {
    const meccaLat = 21.4225 * (Math.PI / 180);
    const meccaLng = 39.8262 * (Math.PI / 180);
    const userLat = latitude * (Math.PI / 180);
    const userLng = longitude * (Math.PI / 180);
    const deltaLng = meccaLng - userLng;
    const y = Math.sin(deltaLng) * Math.cos(meccaLat);
    const x = Math.cos(userLat) * Math.sin(meccaLat) - Math.sin(userLat) * Math.cos(meccaLat) * Math.cos(deltaLng);
    const angle = Math.atan2(y, x) * (180 / Math.PI);
    return (angle + 360) % 360;
  };

  const rotation = qiblaAngle !== null ? (qiblaAngle - compassHeading + 360) % 360 : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Back Button */}
      <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      {/* Title */}
      <Text style={styles.title}>Qibla Direction</Text>
      <Text style={styles.subtitle}>Point your phone flat and rotate until arrow points to Qibla</Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Getting location...</Text>
        </View>
      ) : locationError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{locationError}</Text>
        </View>
      ) : !magnetometerAvailable ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Compass not available on this device</Text>
        </View>
      ) : (
        <View style={styles.content}>
          {/* Compass Circle */}
          <View style={styles.compassContainer}>
            <View style={styles.compassCircle}>
              {/* Direction Labels */}
              <Text style={[styles.directionLabel, styles.northLabel]}>N</Text>
              <Text style={[styles.directionLabel, styles.southLabel]}>S</Text>
              <Text style={[styles.directionLabel, styles.eastLabel]}>E</Text>
              <Text style={[styles.directionLabel, styles.westLabel]}>W</Text>
              
              {/* Qibla Arrow */}
              <View 
                style={[
                  styles.compassArrow,
                  { transform: [{ rotate: `${rotation}deg` }] }
                ]}
              >
                <View style={styles.arrowTriangle} />
                <Text style={styles.kaabaEmoji}>🕋</Text>
              </View>
              
              {/* Center Dot */}
              <View style={styles.centerDot} />
            </View>
          </View>

          {/* Qibla Angle Card */}
          <View style={styles.angleCard}>
            <Text style={styles.angleText}>
              Qibla Angle: {Math.round(qiblaAngle || 0)}° from North
            </Text>
            <Text style={styles.noteText}>Hold your phone flat for accurate reading</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
    paddingTop: 40,
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 32,
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  compassContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  compassCircle: {
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: Colors.white,
    borderWidth: 3,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  directionLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
    position: 'absolute',
  },
  northLabel: {
    top: 20,
    left: '50%',
    marginLeft: -10,
  },
  southLabel: {
    bottom: 20,
    left: '50%',
    marginLeft: -10,
  },
  eastLabel: {
    right: 20,
    top: '50%',
    marginTop: -10,
  },
  westLabel: {
    left: 20,
    top: '50%',
    marginTop: -10,
  },
  compassArrow: {
    position: 'absolute',
    width: 6,
    height: 100,
    alignItems: 'center',
    justifyContent: 'flex-start',
    top: '50%',
    left: '50%',
    marginLeft: -3,
    marginTop: -50,
  },
  arrowTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderBottomWidth: 30,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ef4444',
  },
  kaabaEmoji: {
    fontSize: 24,
    position: 'absolute',
    top: 30,
  },
  centerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -4,
    marginLeft: -4,
  },
  angleCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    shadowColor: Colors.textPrimary,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    width: '100%',
    maxWidth: 320,
  },
  angleText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  noteText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});
