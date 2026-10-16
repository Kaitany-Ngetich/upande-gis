// Shared building blocks. Big touch targets and high contrast - the app is
// used outdoors, in sun, sometimes with gloves.

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/hooks/use-theme';
import type { RunStatus, VisitStatus } from '@/lib/types';

export type Palette = ReturnType<typeof useTheme>;

export function statusColor(theme: Palette, status: VisitStatus | RunStatus): string {
  switch (status) {
    case 'Passed':
    case 'Completed':
      return theme.passed;
    case 'Failed':
    case 'Cancelled':
      return theme.failed;
    case 'Skipped':
    case 'Partially Completed':
      return theme.skipped;
    case 'In Progress':
      return theme.info;
    default:
      return theme.pending;
  }
}

export function T({
  children,
  size = 16,
  weight = '400',
  color,
  muted,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: number;
  weight?: '400' | '500' | '600' | '700' | '800';
  color?: string;
  muted?: boolean;
  style?: object;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        { fontSize: size, lineHeight: Math.round(size * 1.35), fontWeight: weight, color: color ?? (muted ? theme.textSecondary : theme.text) },
        style,
      ]}>
      {children}
    </Text>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const theme = useTheme();
  const base = [styles.card, { backgroundColor: theme.background, borderColor: theme.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  busy?: boolean;
  icon?: string;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const bg =
    kind === 'primary' ? theme.brand : kind === 'danger' ? theme.failed : kind === 'secondary' ? theme.brandSoft : 'transparent';
  const fg = kind === 'primary' ? theme.brandText : kind === 'danger' ? '#fff' : theme.brand;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        kind === 'ghost' && { paddingHorizontal: 8 },
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontSize: 17, fontWeight: '700' }}>{icon ? `${icon}  ${title}` : title}</Text>
      )}
    </Pressable>
  );
}

export function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { backgroundColor: `${color}1F`, borderColor: `${color}55` }]}>
      <Text style={{ color, fontSize: 13, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function Progress({ parts, total }: { parts: { value: number; color: string }[]; total: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.progress, { backgroundColor: theme.backgroundSelected }]}>
      {parts.map((p, i) =>
        p.value > 0 ? <View key={i} style={{ flex: p.value / Math.max(total, 1), backgroundColor: p.color }} /> : null,
      )}
      <View style={{ flex: Math.max(total - parts.reduce((a, p) => a + p.value, 0), 0) / Math.max(total, 1) }} />
    </View>
  );
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <T size={14} weight="600" muted>
        {label}
      </T>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        {...props}
        style={[
          styles.input,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement },
          props.style,
        ]}
      />
    </View>
  );
}

export function Choice({ label, selected, onPress, color }: { label: string; selected: boolean; onPress: () => void; color?: string }) {
  const theme = useTheme();
  const c = color ?? theme.brand;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.choice,
        { borderColor: selected ? c : theme.border, backgroundColor: selected ? `${c}1F` : theme.backgroundElement },
      ]}>
      <Text style={{ color: selected ? c : theme.text, fontWeight: selected ? '700' : '500', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}

export function Banner({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.banner, { backgroundColor: `${color}18`, borderColor: `${color}55` }]}>
      <Text style={{ color, fontWeight: '600', fontSize: 15 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  button: { minHeight: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  progress: { height: 8, borderRadius: 999, overflow: 'hidden', flexDirection: 'row' },
  input: { minHeight: 52, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 17 },
  choice: { minHeight: 48, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  banner: { borderRadius: 12, borderWidth: 1, padding: 12 },
});
