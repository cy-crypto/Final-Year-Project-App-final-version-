import React, { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Font, Radius } from '../constants/theme';

export type DrawerItem = {
  key: string;
  title: string;
  description: string;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  items: DrawerItem[];
  /** Key of the item whose page is open now (highlighted). */
  activeKey?: string;
};

/** Menu that slides in from the left edge. Plain text rows, no icons or emojis. */
export function SideDrawer({ visible, onClose, items, activeKey }: Props) {
  const insets = useSafeAreaInsets();
  const width = Math.min(Dimensions.get('window').width * 0.8, 320);
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, progress]);

  // Android back button closes the drawer first.
  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!mounted) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Animated.View style={[styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          {
            width,
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] }) }],
          },
        ]}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Menu</Text>
            <Text style={styles.subtitle}>All features in one place.</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close menu">
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.list}>
          {items.map((item) => {
            const active = item.key === activeKey;
            return (
              <Pressable
                key={item.key}
                style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && { opacity: 0.8 }]}
                onPress={item.onPress}
              >
                <View style={[styles.marker, active && styles.markerActive]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, active && styles.rowTitleActive]}>{item.title}</Text>
                  <Text style={styles.rowDesc} numberOfLines={1}>{item.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100, elevation: 24 },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.45)' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Colors.surfaceLight,
    borderTopRightRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    paddingHorizontal: 16,
    shadowColor: '#0F172A',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 6, height: 0 },
    elevation: 24,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontFamily: Font.extrabold, fontSize: 28, color: Colors.textPrimary, letterSpacing: -0.4 },
  subtitle: { fontFamily: Font.medium, fontSize: 14, color: Colors.textSecondary, marginTop: 2 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
  },
  rowActive: { backgroundColor: Colors.tintOrange },
  marker: { width: 4, height: 28, borderRadius: 2, backgroundColor: 'transparent' },
  markerActive: { backgroundColor: Colors.primary },
  rowTitle: { fontFamily: Font.bold, fontSize: 18, color: Colors.textPrimary },
  rowTitleActive: { color: Colors.primary },
  rowDesc: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
});
