import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, Card, Field, T } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { TwoFactorRequired } from '@/lib/erp';
import { useSession } from '@/lib/session';

export default function Login() {
  const theme = useTheme();
  const { savedSite, savedEmail, signIn, signInWithCode, startDemo } = useSession();
  const [site, setSite] = useState(savedSite);
  const [email, setEmail] = useState(savedEmail);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [twoFactor, setTwoFactor] = useState<TwoFactorRequired | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!twoFactor && !(site && email && password)) {
      setError('Enter the ERP address, your email and your password.');
      return;
    }
    setBusy(true);
    try {
      if (twoFactor) await signInWithCode(site, email, twoFactor.tmpId, code);
      else await signIn(site, email, password);
    } catch (e: any) {
      if (e instanceof TwoFactorRequired) setTwoFactor(e);
      else setError(e?.message ?? String(e));
    } finally {
      setPassword('');
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.brand }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={[styles.logo, { backgroundColor: theme.brandText }]}>
              <T size={30} weight="800" color={theme.brand}>
                U
              </T>
            </View>
            <T size={30} weight="800" color={theme.brandText}>
              Upande GIS
            </T>
            <T size={16} color={theme.brandText} style={{ opacity: 0.85, textAlign: 'center' }}>
              Field inspections for pipes, cables, valves and every asset on the map.
            </T>
          </View>

          <Card style={{ gap: 16 }}>
            {twoFactor ? (
              <>
                <T size={18} weight="700">
                  Verification code
                </T>
                <T muted>{twoFactor.message}</T>
                <Field
                  label="Code"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoFocus
                  placeholder="123456"
                />
              </>
            ) : (
              <>
                <T size={18} weight="700">
                  Sign in with your ERP account
                </T>
                <Field
                  label="ERP address"
                  value={site}
                  onChangeText={setSite}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="yourcompany.frappe.cloud"
                />
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  placeholder="you@company.com"
                />
                <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
              </>
            )}
            {error ? <Banner text={error} color={theme.failed} /> : null}
            <Button title={twoFactor ? 'Verify' : 'Sign in'} onPress={submit} busy={busy} />
            {twoFactor ? (
              <Button title="Back" kind="ghost" onPress={() => (setTwoFactor(null), setCode(''))} />
            ) : null}
          </Card>

          <Button title="Explore the demo" kind="secondary" onPress={startDemo} style={{ alignSelf: "center", minWidth: 220 }} />
          <T size={13} color={theme.brandText} style={{ opacity: 0.75, textAlign: 'center' }}>
            Your password is only sent to your ERP - it is never stored on this phone.
          </T>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 18, maxWidth: 520, width: '100%', alignSelf: 'center' },
  hero: { alignItems: 'center', gap: 8, marginBottom: 6 },
  logo: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
});
