// Shared building blocks for module screens. Every piece mirrors the Budget module's layout
// (BudgetScreen / TransactionsScreen / AddTransactionScreen) so all modules look the same:
// header with icon buttons, pill tabs, orange hero card, white cards, list rows, chips and a FAB.
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../../constants/theme';

export type IconName = keyof typeof Ionicons.glyphMap;

/* ------------------------------------------------------------------ header */

type HeaderAction = { icon: IconName; onPress: () => void; label: string; badge?: boolean };

export function ModuleHeader({
  title,
  subtitle,
  actions = [],
  showBack = true,
}: {
  title: string;
  subtitle?: string;
  actions?: HeaderAction[];
  showBack?: boolean;
}) {
  const navigation = useNavigation();
  return (
    <View style={s.header}>
      {showBack && navigation.canGoBack() ? (
        <Pressable style={s.iconBtn} onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text style={s.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={s.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions.map((a) => (
        <Pressable key={a.label} style={s.iconBtn} onPress={a.onPress} hitSlop={8} accessibilityLabel={a.label}>
          <Ionicons name={a.icon} size={24} color={Colors.textPrimary} />
          {a.badge ? <View style={s.badgeDot} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

/** Header used on add/edit screens, same as AddTransactionScreen. */
export function FormHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const navigation = useNavigation();
  return (
    <View style={s.formHeader}>
      <Pressable onPress={onBack ?? (() => navigation.goBack())} hitSlop={8}>
        <Text style={s.formBack}>← Back</Text>
      </Pressable>
      <Text style={s.formTitle} numberOfLines={1}>
        {title}
      </Text>
      <View style={{ width: 60 }} />
    </View>
  );
}

/* -------------------------------------------------------------------- tabs */

export function PillTabs<K extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <View style={s.tabs}>
      {tabs.map((t) => (
        <Pressable key={t.key} style={[s.tab, value === t.key && s.tabActive]} onPress={() => onChange(t.key)}>
          <Text style={[s.tabText, value === t.key && s.tabTextActive]} numberOfLines={1}>
            {t.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/* -------------------------------------------------------------------- hero */

export function HeroCard({
  label,
  value,
  children,
  style,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.hero, style]}>
      <Text style={s.heroLabel}>{label}</Text>
      {value !== undefined ? <Text style={s.heroValue}>{value}</Text> : null}
      {children}
    </View>
  );
}

export function HeroStats({ children }: { children: React.ReactNode }) {
  return <View style={s.heroRow}>{children}</View>;
}

export function HeroStat({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={s.heroStat}>
      <View style={s.heroIcon}>
        <Ionicons name={icon} size={16} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.heroStatLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={s.heroStatValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- cards */

export function Card({
  title,
  right,
  children,
  style,
}: {
  title?: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.card, style]}>
      {title || right ? (
        <View style={s.rowBetween}>
          {title ? <Text style={s.cardTitle}>{title}</Text> : <View />}
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function SectionHeader({ title, actionLabel, onAction }: { title: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <View style={s.rowBetween}>
      <Text style={s.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={s.link}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyCard({ text, icon }: { text: string; icon?: IconName }) {
  return (
    <View style={[s.card, { alignItems: 'center' }]}>
      {icon ? <Ionicons name={icon} size={36} color={Colors.textHint} /> : null}
      <Text style={s.emptyText}>{text}</Text>
    </View>
  );
}

/** Tappable entry card with an icon tile, like Budget's "Subscriptions & bills" card. */
export function EntryCard({
  icon,
  title,
  meta,
  note,
  noteColor,
  onPress,
}: {
  icon: IconName;
  title: string;
  meta?: string;
  note?: string;
  noteColor?: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={({ pressed }) => [s.entryCard, pressed && { opacity: 0.85 }]} onPress={onPress}>
      <View style={s.entryIcon}>
        <Ionicons name={icon} size={22} color={Colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.entryTitle}>{title}</Text>
        {meta ? (
          <Text style={s.entryMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {note ? (
          <Text style={[s.entryNote, noteColor ? { color: noteColor } : null]} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.textHint} />
    </Pressable>
  );
}

/** List row in the style of TransactionRow: icon tile, title + meta, right-hand value. */
export function ListRow({
  icon,
  iconColor = Colors.primary,
  iconBg = Colors.primarySurface,
  title,
  meta,
  right,
  rightColor,
  onPress,
  onLongPress,
  done,
  trailing,
}: {
  icon: IconName;
  iconColor?: string;
  iconBg?: string;
  title: string;
  meta?: string;
  right?: string;
  rightColor?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  done?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.row, pressed && onPress && { opacity: 0.85 }]}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
    >
      <View style={[s.rowIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[s.rowTitle, done && s.rowTitleDone]} numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text style={s.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
      {right ? <Text style={[s.rowRight, rightColor ? { color: rightColor } : null]}>{right}</Text> : null}
      {trailing}
    </Pressable>
  );
}

export function ProgressBar({ pct, color = Colors.primary }: { pct: number; color?: string }) {
  const width = `${Math.max(0, Math.min(100, pct))}%` as const;
  return (
    <View style={s.track}>
      <View style={[s.fill, { width, backgroundColor: color }]} />
    </View>
  );
}

export function StatTile({ label, value, tint = Colors.primarySurface, color = Colors.primary }: {
  label: string;
  value: string;
  tint?: string;
  color?: string;
}) {
  return (
    <View style={[s.statTile, { backgroundColor: tint }]}>
      <Text style={[s.statValue, { color }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={s.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Pill({ text, color = Colors.primary, bg = Colors.primarySurface }: { text: string; color?: string; bg?: string }) {
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      <Text style={[s.pillText, { color }]}>{text}</Text>
    </View>
  );
}

/* ------------------------------------------------------------- filters/chips */

export function SearchBox({
  value,
  onChangeText,
  placeholder,
  busy,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  busy?: boolean;
}) {
  return (
    <View style={s.searchBox}>
      <Ionicons name="search" size={20} color={Colors.textHint} />
      <TextInput
        style={s.searchInput}
        placeholder={placeholder}
        placeholderTextColor={Colors.textHint}
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
      />
      {busy ? (
        <ActivityIndicator size="small" color={Colors.primary} />
      ) : value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={10}>
          <Ionicons name="close-circle" size={20} color={Colors.textHint} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function ChipRow<K extends string>({
  options,
  value,
  onChange,
  scroll,
}: {
  options: { key: K; label: string }[];
  value: K | null;
  onChange: (key: K) => void;
  scroll?: boolean;
}) {
  const chips = options.map((o) => (
    <Pressable key={o.key} style={[s.chip, value === o.key && s.chipActive]} onPress={() => onChange(o.key)}>
      <Text style={[s.chipText, value === o.key && s.chipTextActive]}>{o.label}</Text>
    </Pressable>
  ));
  if (scroll) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
        {chips}
      </ScrollView>
    );
  }
  return <View style={[s.chipRow, { flexWrap: 'wrap' }]}>{chips}</View>;
}

/* ------------------------------------------------------------------- forms */

export function FormCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.formCard, style]}>{children}</View>;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <View style={s.formGroup}>
      <Text style={s.formLabel}>{label}</Text>
      {children}
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Input({ multiline, style, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="#9CA3AF"
      multiline={multiline}
      style={[s.formInput, multiline && s.formTextarea, style]}
      {...props}
    />
  );
}

/** Tappable value box used for date/time pickers (Budget's datePickerButton). */
export function PickerButton({ text, onPress, icon = 'calendar-outline', placeholder }: {
  text?: string | null;
  onPress: () => void;
  icon?: IconName;
  placeholder?: string;
}) {
  return (
    <Pressable style={s.pickerBtn} onPress={onPress}>
      <Ionicons name={icon} size={18} color={text ? Colors.primary : Colors.textHint} />
      <Text style={[s.pickerText, !text && { color: Colors.textHint }]}>{text || placeholder || 'Select'}</Text>
    </Pressable>
  );
}

export function Segmented<K extends string>({
  options,
  value,
  onChange,
  colors,
}: {
  options: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  colors?: Partial<Record<K, string>>;
}) {
  return (
    <View style={s.segRow}>
      {options.map((o) => {
        const active = value === o.key;
        const color = colors?.[o.key] ?? Colors.primary;
        return (
          <Pressable
            key={o.key}
            style={[s.segBtn, active && { backgroundColor: color, borderColor: color }]}
            onPress={() => onChange(o.key)}
          >
            <Text style={[s.segText, active && { color: Colors.white }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ToggleRow({ title, meta, value, onValueChange }: {
  title: string;
  meta?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={s.toggleRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {meta ? <Text style={s.rowMeta}>{meta}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: Colors.primary, false: Colors.borderLight }}
        thumbColor={Colors.white}
      />
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  loading,
  disabled,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      style={[s.primaryBtn, (disabled || loading) && s.primaryBtnDisabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={Colors.white} />
      ) : (
        <View style={s.btnInner}>
          {icon ? <Ionicons name={icon} size={18} color={Colors.white} /> : null}
          <Text style={s.primaryBtnText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  onPress,
  icon,
  danger,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const color = danger ? Colors.error : Colors.primary;
  return (
    <Pressable style={[s.secondaryBtn, { borderColor: color }, style]} onPress={onPress}>
      <View style={s.btnInner}>
        {icon ? <Ionicons name={icon} size={18} color={color} /> : null}
        <Text style={[s.secondaryBtnText, { color }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

export function ErrorText({ text }: { text?: string | null }) {
  return text ? <Text style={s.errorText}>{text}</Text> : null;
}

/* ------------------------------------------------------------------- misc */

/** `aboveAssistant` lifts the button over the assistant bubble that floats on bottom-tab screens. */
export function Fab({
  onPress,
  icon = 'add',
  label = 'Add',
  aboveAssistant,
}: {
  onPress: () => void;
  icon?: IconName;
  label?: string;
  aboveAssistant?: boolean;
}) {
  return (
    <Pressable style={[s.fab, aboveAssistant && { bottom: 96, right: 12 }]} onPress={onPress} accessibilityLabel={label}>
      <Ionicons name={icon} size={32} color={Colors.white} />
    </Pressable>
  );
}

export function CenterLoader() {
  return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

export const moduleStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgLight },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 14 },
  formContent: { paddingBottom: 40, gap: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  list: { gap: 10 },
  grid: { flexDirection: 'row', gap: 10 },
  body: { fontFamily: Font.medium, fontSize: 14, lineHeight: 20, color: Colors.textSecondary },
  bodyStrong: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  muted: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  link: { fontFamily: Font.bold, fontSize: 15, color: Colors.primary },
});

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  badgeDot: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.error,
    borderWidth: 1.5,
    borderColor: Colors.bgLight,
  },
  title: { fontFamily: Font.extrabold, fontSize: 28, color: Colors.textPrimary, letterSpacing: -0.4, paddingLeft: 4 },
  subtitle: { fontFamily: Font.medium, fontSize: 15, color: Colors.textSecondary, paddingLeft: 4 },

  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  formBack: { fontFamily: Font.semibold, fontSize: 16, color: Colors.primary, width: 60 },
  formTitle: {
    fontFamily: Font.extrabold,
    fontSize: 22,
    color: Colors.primary,
    textAlign: 'center',
    flex: 1,
    letterSpacing: -0.3,
  },

  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    padding: 4,
    borderRadius: Radius.pill,
    backgroundColor: Colors.tintSlate,
    marginBottom: 12,
  },
  tab: { flex: 1, height: 42, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabActive: { backgroundColor: Colors.primary, ...Shadows.button },
  tabText: { fontFamily: Font.semibold, fontSize: 14, color: Colors.textSecondary },
  tabTextActive: { color: Colors.white, fontFamily: Font.bold },

  hero: { backgroundColor: Colors.primary, borderRadius: Radius.xl, padding: 16, gap: 4, ...Shadows.button },
  heroLabel: { fontFamily: Font.semibold, fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  heroValue: { fontFamily: Font.extrabold, fontSize: 30, color: Colors.white, letterSpacing: -0.6 },
  heroRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  heroStat: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.md,
    padding: 10,
  },
  heroIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center' },
  heroStatLabel: { fontFamily: Font.medium, fontSize: 12, color: 'rgba(255,255,255,0.9)' },
  heroStatValue: { fontFamily: Font.extrabold, fontSize: 16, color: Colors.white },

  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 14,
    gap: 12,
    ...Shadows.card,
  },
  cardTitle: { fontFamily: Font.extrabold, fontSize: 16, color: Colors.textPrimary },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontFamily: Font.extrabold, fontSize: 18, color: Colors.textPrimary },
  link: { fontFamily: Font.bold, fontSize: 15, color: Colors.primary },
  emptyText: { fontFamily: Font.medium, fontSize: 15, lineHeight: 22, color: Colors.textSecondary, textAlign: 'center' },

  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 12,
    ...Shadows.card,
  },
  entryIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primarySurface, alignItems: 'center', justifyContent: 'center' },
  entryTitle: { fontFamily: Font.bold, fontSize: 16, color: Colors.textPrimary },
  entryMeta: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  entryNote: { fontFamily: Font.semibold, fontSize: 13, color: Colors.primary, marginTop: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 10,
    ...Shadows.card,
  },
  rowIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  rowTitleDone: { textDecorationLine: 'line-through', color: Colors.textHint },
  rowMeta: { fontFamily: Font.medium, fontSize: 13, color: Colors.textSecondary },
  rowRight: { fontFamily: Font.extrabold, fontSize: 14, color: Colors.textPrimary },

  track: { height: 10, borderRadius: 5, backgroundColor: Colors.primarySurface, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },

  statTile: { flex: 1, borderRadius: Radius.md, paddingVertical: 12, paddingHorizontal: 10, gap: 2, alignItems: 'center' },
  statValue: { fontFamily: Font.extrabold, fontSize: 20 },
  statLabel: { fontFamily: Font.semibold, fontSize: 12, color: Colors.textSecondary },

  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, alignSelf: 'flex-start' },
  pillText: { fontFamily: Font.bold, fontSize: 12 },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
  },
  searchInput: { flex: 1, fontFamily: Font.medium, fontSize: 16, color: Colors.textPrimary, padding: 0 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: {
    paddingHorizontal: 16,
    height: 38,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontFamily: Font.semibold, fontSize: 14, color: Colors.textSecondary },
  chipTextActive: { color: Colors.white },

  formCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderSoft,
    padding: 16,
    marginHorizontal: 16,
    gap: 16,
    ...Shadows.card,
  },
  formGroup: { gap: 8 },
  formLabel: { fontFamily: Font.semibold, fontSize: 14, color: Colors.primary },
  hint: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  formInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgLight,
    paddingHorizontal: 12,
    fontFamily: Font.medium,
    fontSize: 16,
    color: Colors.textPrimary,
  },
  formTextarea: { height: 80, textAlignVertical: 'top', paddingTop: 12 },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgLight,
    height: 42,
    paddingHorizontal: 12,
  },
  pickerText: { fontFamily: Font.medium, fontSize: 16, color: Colors.textPrimary },
  segRow: { flexDirection: 'row', gap: 8 },
  segBtn: {
    flex: 1,
    height: 42,
    borderWidth: 1.5,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segText: { fontFamily: Font.bold, fontSize: 14, color: Colors.textSecondary },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.button,
  },
  primaryBtnDisabled: { backgroundColor: Colors.primaryLight },
  primaryBtnText: { fontFamily: Font.bold, color: Colors.white, fontSize: 16 },
  secondaryBtn: {
    borderRadius: Radius.md,
    height: 46,
    borderWidth: 1.5,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: { fontFamily: Font.bold, fontSize: 16 },
  errorText: { fontFamily: Font.semibold, color: Colors.error, fontSize: 14 },

  fab: {
    position: 'absolute',
    right: 24,
    bottom: 28,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.button,
  },
});
