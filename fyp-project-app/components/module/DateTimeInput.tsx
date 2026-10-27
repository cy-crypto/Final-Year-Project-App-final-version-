import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { Colors, Font } from '../../constants/theme';
import { PickerButton } from './ModuleUI';
import { isDarkMode } from '../../constants/appearance';

type Props = {
  value: Date | null;
  mode: 'date' | 'time';
  onChange: (value: Date) => void;
  placeholder?: string;
  minimumDate?: Date;
  onClear?: () => void;
};

function formatValue(value: Date, mode: 'date' | 'time') {
  return mode === 'date'
    ? value.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })
    : value.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Date or time field in the Budget form style. Android opens the system dialog; iOS shows the
 * picker inline under the field with a Done button, so scrolling a spinner does not close it.
 */
export function DateTimeInput({ value, mode, onChange, placeholder, minimumDate, onClear }: Props) {
  const [open, setOpen] = useState(false);

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (event.type === 'set' && selected) onChange(selected);
  };

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <PickerButton
            text={value ? formatValue(value, mode) : null}
            placeholder={placeholder}
            icon={mode === 'date' ? 'calendar-outline' : 'time-outline'}
            onPress={() => setOpen((v) => !v)}
          />
        </View>
        {value && onClear ? (
          <Pressable onPress={onClear} hitSlop={8}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <>
          <DateTimePicker
            value={value ?? new Date()}
            mode={mode}
            minimumDate={minimumDate}
            display={Platform.OS === 'ios' ? (mode === 'date' ? 'inline' : 'spinner') : 'default'}
            onChange={handleChange}
            accentColor={Colors.primary}
            themeVariant={isDarkMode() ? 'dark' : 'light'}
            textColor={Platform.OS === 'ios' ? Colors.textPrimary : undefined}
          />
          {Platform.OS === 'ios' ? (
            <Pressable
              onPress={() => {
                if (!value) onChange(new Date());
                setOpen(false);
              }}
              style={styles.done}
            >
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clear: { fontFamily: Font.bold, fontSize: 14, color: Colors.primary },
  done: { alignSelf: 'flex-end', paddingHorizontal: 8, paddingVertical: 4 },
  doneText: { fontFamily: Font.bold, fontSize: 15, color: Colors.primary },
});
