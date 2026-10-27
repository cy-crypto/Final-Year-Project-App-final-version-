import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Font, Shadows } from '../constants/theme';

/**
 * Phone-style mock illustrations, one per core module.
 * Built from plain views so they stay crisp at any density and match the theme.
 */

function Phone({ children }: { children: React.ReactNode }) {
  return <View style={s.phone}>{children}</View>;
}

function FloatChip({
  icon,
  label,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  style: object;
}) {
  return (
    <View style={[s.chip, style]}>
      <View style={s.chipIcon}>
        <Ionicons name={icon} size={14} color={Colors.white} />
      </View>
      <Text style={s.chipText}>{label}</Text>
    </View>
  );
}

export function ChatbotIllustration() {
  return (
    <View style={s.stage}>
      <Phone>
        <View style={s.chatHeader}>
          <View style={s.botAvatar}>
            <MaterialCommunityIcons name="robot-happy-outline" size={22} color={Colors.white} />
          </View>
          <View>
            <Text style={s.phoneTitle}>Companion AI</Text>
            <Text style={s.online}>● Online</Text>
          </View>
        </View>
        <View style={[s.bubble, s.bubbleUser]}>
          <Text style={s.bubbleUserText}>How is my budget this month?</Text>
        </View>
        <View style={[s.bubble, s.bubbleBot]}>
          <Text style={s.bubbleBotText}>You've used 71% of it. Nice pace — keep going! 🎉</Text>
        </View>
        <View style={[s.bubble, s.bubbleUser]}>
          <Text style={s.bubbleUserText}>Remind me to walk at 6</Text>
        </View>
        <View style={s.inputBar}>
          <Text style={s.inputHint}>Ask anything…</Text>
          <View style={s.send}>
            <Ionicons name="send" size={14} color={Colors.white} />
          </View>
        </View>
      </Phone>
      <FloatChip icon="sparkles" label="Smart answers" style={{ top: 18, right: -6 }} />
      <FloatChip icon="mic" label="Voice input" style={{ bottom: 34, left: -10 }} />
    </View>
  );
}

export function FitnessIllustration() {
  const r = 52;
  const c = 2 * Math.PI * r;
  const progress = 0.72;
  return (
    <View style={s.stage}>
      <Phone>
        <Text style={s.phoneTitle}>Today's activity</Text>
        <View style={s.ringWrap}>
          <Svg width={140} height={140}>
            <Circle cx={70} cy={70} r={r} stroke={Colors.primarySurface} strokeWidth={14} fill="none" />
            <Circle
              cx={70}
              cy={70}
              r={r}
              stroke={Colors.primary}
              strokeWidth={14}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${c * progress} ${c}`}
              transform="rotate(-90 70 70)"
            />
          </Svg>
          <View style={s.ringCenter}>
            <Text style={s.ringValue}>7,240</Text>
            <Text style={s.ringLabel}>steps</Text>
          </View>
        </View>
        <View style={s.statRow}>
          {[
            { i: 'flame', v: '420', l: 'kcal' },
            { i: 'navigate', v: '5.2', l: 'km' },
            { i: 'time', v: '48', l: 'min' },
          ].map((m) => (
            <View key={m.l} style={s.miniStat}>
              <Ionicons name={m.i as any} size={16} color={Colors.primary} />
              <Text style={s.miniValue}>{m.v}</Text>
              <Text style={s.miniLabel}>{m.l}</Text>
            </View>
          ))}
        </View>
      </Phone>
      <FloatChip icon="trophy" label="Goal 72%" style={{ top: 22, left: -10 }} />
      <FloatChip icon="barbell" label="Log workout" style={{ bottom: 30, right: -8 }} />
    </View>
  );
}

export function MedicineIllustration() {
  const meds = [
    { name: 'Vitamin D', dose: '1 tablet · 8:00 AM', done: true },
    { name: 'Metformin', dose: '500 mg · 1:30 PM', done: false },
    { name: 'Omega-3', dose: '1 capsule · 9:00 PM', done: false },
  ];
  return (
    <View style={s.stage}>
      <Phone>
        <Text style={s.phoneTitle}>Today's medicine</Text>
        {meds.map((m) => (
          <View key={m.name} style={s.medRow}>
            <View style={[s.medIcon, m.done && { backgroundColor: Colors.primary }]}>
              <MaterialCommunityIcons
                name="pill"
                size={20}
                color={m.done ? Colors.white : Colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.medName}>{m.name}</Text>
              <Text style={s.medDose}>{m.dose}</Text>
            </View>
            <View style={[s.check, m.done && s.checkDone]}>
              {m.done && <Ionicons name="checkmark" size={14} color={Colors.white} />}
            </View>
          </View>
        ))}
        <View style={s.nextDose}>
          <Ionicons name="alarm" size={16} color={Colors.primary} />
          <Text style={s.nextDoseText}>Next dose in 2h 15m</Text>
        </View>
      </Phone>
      <FloatChip icon="notifications" label="Dose reminder" style={{ top: 16, right: -8 }} />
      <FloatChip icon="shield-checkmark" label="Never miss one" style={{ bottom: 28, left: -10 }} />
    </View>
  );
}

export function BudgetIllustration() {
  const bars = [0.4, 0.65, 0.5, 0.85, 0.55, 0.7, 0.45];
  return (
    <View style={s.stage}>
      <Phone>
        <Text style={s.phoneLabel}>Monthly budget</Text>
        <Text style={s.amount}>
          Rs 42,500 <Text style={s.amountOf}>of 60,000</Text>
        </Text>
        <View style={s.track}>
          <View style={[s.fill, { width: '71%' }]} />
        </View>
        <View style={s.barsRow}>
          {bars.map((h, i) => (
            <View key={i} style={s.barSlot}>
              <View
                style={[
                  s.bar,
                  { height: 70 * h },
                  i === 3 && { backgroundColor: Colors.primary },
                ]}
              />
            </View>
          ))}
        </View>
        {[
          { i: 'restaurant', l: 'Food', v: '12,400' },
          { i: 'car', l: 'Transport', v: '6,800' },
        ].map((r) => (
          <View key={r.l} style={s.catRow}>
            <View style={s.catIcon}>
              <Ionicons name={r.i as any} size={14} color={Colors.primary} />
            </View>
            <Text style={s.catLabel}>{r.l}</Text>
            <Text style={s.catValue}>{r.v}</Text>
          </View>
        ))}
      </Phone>
      <FloatChip icon="trending-down" label="12% less" style={{ top: 20, left: -10 }} />
      <FloatChip icon="pie-chart" label="Smart limits" style={{ bottom: 26, right: -8 }} />
    </View>
  );
}

export function DashboardIllustration() {
  const tiles = [
    { i: 'checkbox', l: 'Tasks', v: '3 today' },
    { i: 'flame', l: 'Habits', v: '4/6 done' },
    { i: 'medkit', l: 'Medicine', v: '1:30 PM' },
    { i: 'wallet', l: 'Budget', v: '71% used' },
  ];
  return (
    <View style={s.stage}>
      <Phone>
        <Text style={s.phoneLabel}>Good morning</Text>
        <Text style={s.greet}>Your day at a glance</Text>
        <View style={s.nextUp}>
          <View style={s.pulse} />
          <Text style={s.nextUpText}>Next up · Metformin in 2h</Text>
        </View>
        <View style={s.tileGrid}>
          {tiles.map((t) => (
            <View key={t.l} style={s.tile}>
              <View style={s.tileIcon}>
                <Ionicons name={t.i as any} size={16} color={Colors.white} />
              </View>
              <Text style={s.tileLabel}>{t.l}</Text>
              <Text style={s.tileValue}>{t.v}</Text>
            </View>
          ))}
        </View>
      </Phone>
      <FloatChip icon="grid" label="All in one" style={{ top: 18, right: -8 }} />
      <FloatChip icon="partly-sunny" label="28° Clear" style={{ bottom: 32, left: -10 }} />
    </View>
  );
}

const s = StyleSheet.create({
  stage: { width: 300, height: 340, alignItems: 'center', justifyContent: 'center' },
  phone: {
    width: 232,
    height: 316,
    borderRadius: 34,
    backgroundColor: Colors.white,
    borderWidth: 6,
    borderColor: '#FFE3D2',
    padding: 14,
    gap: 10,
    overflow: 'hidden',
    ...Shadows.card,
    shadowColor: Colors.primary,
    shadowOpacity: 0.22,
  },
  phoneTitle: { fontFamily: Font.bold, fontSize: 15, color: Colors.textPrimary },
  phoneLabel: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },

  chip: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    borderRadius: 999,
    paddingVertical: 6,
    paddingLeft: 6,
    paddingRight: 12,
    ...Shadows.card,
    shadowOpacity: 0.14,
    elevation: 6,
  },
  chipIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: { fontFamily: Font.bold, fontSize: 12, color: Colors.textPrimary },

  // chatbot
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 2 },
  botAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  online: { fontFamily: Font.semibold, fontSize: 11, color: Colors.success },
  bubble: { maxWidth: '86%', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16 },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: Colors.primary, borderBottomRightRadius: 4 },
  bubbleBot: { alignSelf: 'flex-start', backgroundColor: Colors.primarySurface, borderBottomLeftRadius: 4 },
  bubbleUserText: { fontFamily: Font.medium, fontSize: 12, lineHeight: 17, color: Colors.white },
  bubbleBotText: { fontFamily: Font.medium, fontSize: 12, lineHeight: 17, color: Colors.textPrimary },
  inputBar: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.tintSlate,
    borderRadius: 999,
    paddingLeft: 14,
    paddingRight: 4,
    height: 38,
  },
  inputHint: { flex: 1, fontFamily: Font.medium, fontSize: 12, color: Colors.textHint },
  send: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // fitness
  ringWrap: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringValue: { fontFamily: Font.extrabold, fontSize: 24, color: Colors.textPrimary },
  ringLabel: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  statRow: { flexDirection: 'row', gap: 8, marginTop: 'auto' },
  miniStat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.primarySurface,
    borderRadius: 14,
    paddingVertical: 8,
    gap: 1,
  },
  miniValue: { fontFamily: Font.extrabold, fontSize: 15, color: Colors.textPrimary },
  miniLabel: { fontFamily: Font.medium, fontSize: 11, color: Colors.textSecondary },

  // medicine
  medRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.bgLight,
    borderRadius: 16,
    padding: 10,
  },
  medIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medName: { fontFamily: Font.bold, fontSize: 13, color: Colors.textPrimary },
  medDose: { fontFamily: Font.medium, fontSize: 11, color: Colors.textSecondary, marginTop: 1 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  nextDose: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primarySurface,
    borderRadius: 14,
    padding: 10,
  },
  nextDoseText: { fontFamily: Font.bold, fontSize: 12, color: Colors.primary },

  // budget
  amount: { fontFamily: Font.extrabold, fontSize: 21, color: Colors.textPrimary },
  amountOf: { fontFamily: Font.medium, fontSize: 12, color: Colors.textSecondary },
  track: { height: 8, borderRadius: 4, backgroundColor: Colors.primarySurface, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4, backgroundColor: Colors.primary },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', height: 74, gap: 6, marginTop: 2 },
  barSlot: { flex: 1, justifyContent: 'flex-end' },
  bar: { borderRadius: 6, backgroundColor: '#FFD2B8' },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.primarySurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catLabel: { flex: 1, fontFamily: Font.semibold, fontSize: 12, color: Colors.textPrimary },
  catValue: { fontFamily: Font.bold, fontSize: 12, color: Colors.textSecondary },

  // dashboard
  greet: { fontFamily: Font.extrabold, fontSize: 18, color: Colors.textPrimary, marginTop: -6 },
  nextUp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.primarySurface,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary },
  nextUpText: { fontFamily: Font.bold, fontSize: 12, color: Colors.primary },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 'auto' },
  tile: {
    width: '48%',
    backgroundColor: Colors.bgLight,
    borderRadius: 16,
    padding: 10,
    gap: 2,
  },
  tileIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  tileLabel: { fontFamily: Font.medium, fontSize: 11, color: Colors.textSecondary },
  tileValue: { fontFamily: Font.extrabold, fontSize: 13, color: Colors.textPrimary },
});
