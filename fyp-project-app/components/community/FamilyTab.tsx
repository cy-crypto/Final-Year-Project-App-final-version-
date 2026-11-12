import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, Font, Radius, Shadows } from '../../constants/theme';
import { toApiErrorMessage } from '../../services/api';
import {
  inviteToFamily,
  leaveFamily,
  respondToInvite,
  type FamilyInvite,
  type FamilyOverview,
} from '../../services/communityService';
import { Card, EmptyCard, ListRow, moduleStyles } from '../module/ModuleUI';
import { Avatar } from './PostCard';

type Props = {
  data: FamilyOverview | null;
  error: string | null;
  /** Called with the server's fresh overview after every change. */
  onChange: (next: FamilyOverview) => void;
};

/** Your Family ID, adding people by their ID, requests and the member list. */
export function FamilyTab({ data, error, onChange }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  if (!data) {
    return error ? <EmptyCard text={error} icon="cloud-offline-outline" /> : <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />;
  }

  const run = async (task: () => Promise<FamilyOverview>, failMessage: string) => {
    setBusy(true);
    try {
      onChange(await task());
      return true;
    } catch (err) {
      Alert.alert('Family', toApiErrorMessage(err, failMessage));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sendInvite = async () => {
    if (!code.trim()) return;
    if (await run(() => inviteToFamily(code), 'Could not send the request.')) {
      setCode('');
      Alert.alert('Request sent', 'They will join your family once they accept.');
    }
  };

  const shareCode = () =>
    Share.share({ message: `Join my family on Personal Companion. My Family ID is ${data.my_code}` }).catch(() => {});

  const confirmLeave = () =>
    Alert.alert('Leave family', 'You will no longer see your family’s posts, challenges and leaderboard.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => run(leaveFamily, 'Could not leave the family.') },
    ]);

  const members = data.family?.members ?? [];

  return (
    <>
      {/* Your ID */}
      <View style={styles.idCard}>
        <Text style={styles.idLabel}>Your Family ID</Text>
        <Text style={styles.idCode} selectable>
          {data.my_code}
        </Text>
        <Text style={styles.idHint}>Share it with family so they can add you, or add them with theirs.</Text>
        <Pressable style={({ pressed }) => [styles.shareBtn, pressed && { opacity: 0.85 }]} onPress={shareCode}>
          <Ionicons name="share-social-outline" size={18} color={Colors.primary} />
          <Text style={styles.shareText}>Share my ID</Text>
        </Pressable>
      </View>

      {/* Add by ID */}
      <Card title="Add a family member">
        <View style={moduleStyles.row}>
          <TextInput
            style={styles.input}
            placeholder="Enter their Family ID"
            placeholderTextColor={Colors.textHint}
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={8}
            onSubmitEditing={sendInvite}
          />
          <Pressable style={[styles.addBtn, (!code.trim() || busy) && { opacity: 0.6 }]} onPress={sendInvite} disabled={!code.trim() || busy}>
            {busy ? <ActivityIndicator color={Colors.white} /> : <Ionicons name="person-add" size={20} color={Colors.white} />}
          </Pressable>
        </View>
        <Text style={moduleStyles.muted}>They get a request and join your family once they accept.</Text>
      </Card>

      {/* Requests to me */}
      {data.incoming.length > 0 ? (
        <Card title="Requests for you">
          {data.incoming.map((inv) => (
            <InviteRow
              key={inv.id}
              invite={inv}
              meta={`Wants you to join their family · ${inv.code}`}
              actions={
                <>
                  <SmallButton label="Accept" solid onPress={() => run(() => respondToInvite(inv.id, 'accept'), 'Could not accept.')} />
                  <SmallButton label="Decline" onPress={() => run(() => respondToInvite(inv.id, 'decline'), 'Could not decline.')} />
                </>
              }
            />
          ))}
          {data.family ? <Text style={moduleStyles.muted}>Accepting moves you out of your current family.</Text> : null}
        </Card>
      ) : null}

      {/* Members */}
      <Card title={data.family ? `${data.family.name} · ${members.length}` : 'Your family'}>
        {members.length === 0 ? (
          <Text style={moduleStyles.body}>You have not added anyone yet. Posts, challenges and the leaderboard are only shared with your family.</Text>
        ) : (
          members.map((m) => (
            <ListRow
              key={m.user_id}
              icon="person-outline"
              title={`${m.name}${m.is_me ? ' (you)' : ''}`}
              meta={`ID ${m.code}`}
            />
          ))
        )}
      </Card>

      {/* Requests I sent */}
      {data.outgoing.length > 0 ? (
        <Card title="Waiting for them to accept">
          {data.outgoing.map((inv) => (
            <InviteRow
              key={inv.id}
              invite={inv}
              meta={`ID ${inv.code}`}
              actions={<SmallButton label="Cancel" onPress={() => run(() => respondToInvite(inv.id, 'cancel'), 'Could not cancel.')} />}
            />
          ))}
        </Card>
      ) : null}

      {data.family ? (
        <Pressable style={styles.leave} onPress={confirmLeave}>
          <Text style={styles.leaveText}>Leave family</Text>
        </Pressable>
      ) : null}
    </>
  );
}

function InviteRow({ invite, meta, actions }: { invite: FamilyInvite; meta: string; actions: React.ReactNode }) {
  return (
    <View style={styles.inviteRow}>
      <Avatar author={{ name: invite.name, avatar_url: '' }} size={36} />
      <View style={{ flex: 1 }}>
        <Text style={moduleStyles.bodyStrong} numberOfLines={1}>
          {invite.name}
        </Text>
        <Text style={moduleStyles.muted} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      {actions}
    </View>
  );
}

function SmallButton({ label, onPress, solid }: { label: string; onPress: () => void; solid?: boolean }) {
  return (
    <Pressable style={[styles.smallBtn, solid ? styles.smallSolid : styles.smallGhost]} onPress={onPress} hitSlop={4}>
      <Text style={[styles.smallText, { color: solid ? Colors.white : Colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  idCard: {
    backgroundColor: Colors.heroOrange,
    borderRadius: Radius.xl,
    padding: 18,
    gap: 6,
    alignItems: 'center',
    ...Shadows.button,
  },
  idLabel: { fontFamily: Font.semibold, fontSize: 14, color: 'rgba(255,255,255,0.95)' },
  idCode: { fontFamily: Font.extrabold, fontSize: 34, letterSpacing: 6, color: Colors.white },
  idHint: { fontFamily: Font.medium, fontSize: 13, color: 'rgba(255,255,255,0.95)', textAlign: 'center' },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    backgroundColor: Colors.white,
    borderRadius: Radius.pill,
    paddingHorizontal: 16,
    height: 38,
  },
  shareText: { fontFamily: Font.bold, fontSize: 14, color: Colors.primary },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    backgroundColor: Colors.bgLight,
    paddingHorizontal: 12,
    fontFamily: Font.bold,
    fontSize: 16,
    letterSpacing: 2,
    color: Colors.textPrimary,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  smallBtn: { height: 34, paddingHorizontal: 12, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
  smallSolid: { backgroundColor: Colors.primary },
  smallGhost: { borderWidth: 1.5, borderColor: Colors.primary },
  smallText: { fontFamily: Font.bold, fontSize: 13 },
  leave: { alignItems: 'center', paddingVertical: 12 },
  leaveText: { fontFamily: Font.bold, fontSize: 15, color: Colors.error },
});
