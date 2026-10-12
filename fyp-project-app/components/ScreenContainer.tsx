import React from 'react';
import { ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '../constants/theme';

type Props = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  safeAreaStyle?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  hideHeader?: boolean;
  rightIcon?: {
    name: string;
    onPress: () => void;
    color: string;
  };
};

export function ScreenContainer({
  title,
  subtitle,
  children,
  safeAreaStyle,
  contentContainerStyle,
  hideHeader,
  rightIcon,
}: Props) {
  return (
    <SafeAreaView style={[styles.safeArea, safeAreaStyle]}>
      <ScrollView contentContainerStyle={[styles.contentContainer, contentContainerStyle]}>
        {hideHeader ? null : (
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {rightIcon ? (
              <Pressable onPress={rightIcon.onPress} style={styles.rightIcon}>
                <Text style={[styles.iconText, { color: rightIcon.color }]}>
                  {rightIcon.name === 'location' ? '📍' : '⚙️'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        )}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  contentContainer: {
    padding: 16,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  headerContent: {
    flex: 1,
  },
  rightIcon: {
    padding: 8,
  },
  iconText: {
    fontSize: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
});
