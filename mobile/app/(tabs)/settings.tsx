import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Settings</Text>

        <SettingsSection title="Mac Connection">
          <SettingsRow label="Status" value="Not connected" />
          <SettingsRow label="Device" value="—" />
        </SettingsSection>

        <SettingsSection title="Metadata Capture">
          <SettingsRow label="Location" value="On" />
          <SettingsRow label="Weather" value="On" />
          <SettingsRow label="Daylight" value="On" />
          <SettingsRow label="Step count" value="On" />
          <SettingsRow label="HealthKit" value="Off" />
        </SettingsSection>

        <SettingsSection title="Appearance">
          <SettingsRow label="Theme" value="Dark" />
        </SettingsSection>

        <SettingsSection title="Storage">
          <SettingsRow label="Local memos" value="0" />
          <SettingsRow label="Storage used" value="0 MB" />
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
});
