import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Pressable, Alert, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { getWeatherApiKey, setWeatherApiKey } from '../../lib/metadata';
import { loadMemos } from '../../lib/storage';
import {
  getMacConnection,
  setMacConnection,
  checkMacHealth,
  getLastSyncTime,
  type MacConnection,
} from '../../lib/sync';
import { theme } from '../../constants/colors';

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>{children}</View>
    </View>
  );
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [memoCount, setMemoCount] = useState(0);

  // Mac connection state
  const [connection, setConnection] = useState<MacConnection | null>(null);
  const [macReachable, setMacReachable] = useState<boolean | null>(null);
  const [testing, setTesting] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Manual IP entry
  const [manualHost, setManualHost] = useState('');
  const [manualPort, setManualPort] = useState('8000');

  useFocusEffect(
    useCallback(() => {
      getWeatherApiKey().then((key) => {
        setSavedKey(key);
        setApiKey(key ?? '');
      });
      loadMemos().then((memos) => setMemoCount(memos.length));
      getMacConnection().then((conn) => {
        setConnection(conn);
        if (conn) {
          setManualHost(conn.host);
          setManualPort(String(conn.port));
          // Auto-test on load
          checkMacHealth(conn.host, conn.port).then(setMacReachable);
        }
      });
      getLastSyncTime().then(setLastSync);
    }, [])
  );

  const handleSaveKey = async () => {
    await setWeatherApiKey(apiKey);
    setSavedKey(apiKey.trim() || null);
    Alert.alert('Saved', apiKey.trim() ? 'Weather API key saved.' : 'Weather API key removed.');
  };

  const handleTestConnection = async () => {
    const host = manualHost.trim();
    const port = parseInt(manualPort.trim() || '8000', 10);
    if (!host) {
      Alert.alert('Enter IP', 'Please enter your Mac\'s IP address.');
      return;
    }

    setTesting(true);
    const reachable = await checkMacHealth(host, port);
    setMacReachable(reachable);
    setTesting(false);

    if (reachable) {
      const conn: MacConnection = { host, port, deviceName: 'Mac' };
      await setMacConnection(conn);
      setConnection(conn);
      Alert.alert('Connected', `Successfully connected to ${host}:${port}`);
    } else {
      Alert.alert('Unreachable', `Could not reach ${host}:${port}. Is Skrift running on your Mac?`);
    }
  };

  const handleSaveConnection = async () => {
    const host = manualHost.trim();
    const port = parseInt(manualPort.trim() || '8000', 10);
    if (!host) return;
    const conn: MacConnection = { host, port, deviceName: connection?.deviceName ?? 'Mac' };
    await setMacConnection(conn);
    setConnection(conn);
  };

  const keyChanged = apiKey.trim() !== (savedKey ?? '');

  const formatLastSync = (iso: string | null) => {
    if (!iso) return 'Never';
    const d = new Date(iso);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Settings</Text>

        <SettingsSection title="Mac Connection">
          <View style={styles.connectionHeader}>
            <View style={styles.connectionStatus}>
              <View style={[styles.statusDot, macReachable ? styles.statusDotGreen : styles.statusDotRed]} />
              <Text style={styles.connectionStatusText}>
                {macReachable === null ? 'Not checked' : macReachable ? 'Connected' : 'Not connected'}
              </Text>
            </View>
            {connection && (
              <Text style={styles.connectionInfo}>
                {connection.deviceName} — {connection.host}:{connection.port}
              </Text>
            )}
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>Mac IP address</Text>
            <View style={styles.hostPortRow}>
              <TextInput
                style={[styles.input, styles.hostInput]}
                value={manualHost}
                onChangeText={setManualHost}
                placeholder="e.g. 192.168.1.42"
                placeholderTextColor={theme.textMuted}
                keyboardType="decimal-pad"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.colonText}>:</Text>
              <TextInput
                style={[styles.input, styles.portInput]}
                value={manualPort}
                onChangeText={setManualPort}
                placeholder="8000"
                placeholderTextColor={theme.textMuted}
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.connectionButtons}>
              <Pressable
                style={[styles.connectionButton, styles.testButton]}
                onPress={handleTestConnection}
                disabled={testing}
              >
                {testing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.connectionButtonText}>Test Connection</Text>
                )}
              </Pressable>

              <Pressable
                style={[styles.connectionButton, styles.scanButton]}
                onPress={() => router.push('/scan-qr')}
              >
                <Text style={styles.connectionButtonText}>Scan QR Code</Text>
              </Pressable>
            </View>
          </View>

          <SettingsRow label="Last sync" value={formatLastSync(lastSync)} />
        </SettingsSection>

        <SettingsSection title="Weather API">
          <View style={styles.apiKeyRow}>
            <Text style={styles.rowLabel}>OpenWeatherMap key</Text>
            <View style={styles.apiKeyInputRow}>
              <TextInput
                style={styles.apiKeyInput}
                value={apiKey}
                onChangeText={setApiKey}
                placeholder="Paste API key here"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!apiKey}
              />
              {keyChanged && (
                <Pressable style={styles.saveKeyButton} onPress={handleSaveKey}>
                  <Text style={styles.saveKeyText}>Save</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.apiKeyHint}>
              Free at openweathermap.org/api — enables weather + pressure capture
            </Text>
            {savedKey && (
              <Text style={styles.apiKeyStatus}>Key configured</Text>
            )}
          </View>
        </SettingsSection>

        <SettingsSection title="Metadata Capture">
          <SettingsRow label="Location" value="On" />
          <SettingsRow label="Weather" value={savedKey ? 'On' : 'No API key'} />
          <SettingsRow label="Daylight" value="On" />
          <SettingsRow label="Step count" value="On" />
          <SettingsRow label="HealthKit" value="Off" />
        </SettingsSection>

        <SettingsSection title="Appearance">
          <SettingsRow label="Theme" value="Dark" />
        </SettingsSection>

        <SettingsSection title="Storage">
          <SettingsRow label="Local memos" value={String(memoCount)} />
        </SettingsSection>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.bg,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: theme.textPrimary,
    paddingTop: 12,
    marginBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionContent: {
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  rowLabel: {
    fontSize: 15,
    color: theme.textPrimary,
  },
  rowValue: {
    fontSize: 15,
    color: theme.textSecondary,
  },
  // Mac Connection
  connectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotGreen: {
    backgroundColor: theme.checkGreen,
  },
  statusDotRed: {
    backgroundColor: theme.destructive,
  },
  connectionStatusText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.textPrimary,
  },
  connectionInfo: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 4,
  },
  inputSection: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.border,
  },
  inputLabel: {
    fontSize: 13,
    color: theme.textSecondary,
    marginBottom: 8,
  },
  hostPortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  input: {
    backgroundColor: theme.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  hostInput: {
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  portInput: {
    width: 70,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  colonText: {
    fontSize: 16,
    color: theme.textMuted,
    fontWeight: '600',
  },
  connectionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  connectionButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  testButton: {
    backgroundColor: theme.accent,
  },
  scanButton: {
    backgroundColor: theme.surfaceHover,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  },
  connectionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  // API key
  apiKeyRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  apiKeyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  apiKeyInput: {
    flex: 1,
    backgroundColor: theme.bg,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.textPrimary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  saveKeyButton: {
    backgroundColor: theme.accent,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  saveKeyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  apiKeyHint: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 8,
  },
  apiKeyStatus: {
    fontSize: 12,
    color: theme.checkGreen,
    marginTop: 4,
  },
});
