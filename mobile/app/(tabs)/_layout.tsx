import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/colors';

/** Simple SVG-like icons using basic shapes */
function MemosIcon({ focused }: { focused: boolean }) {
  const color = focused ? theme.accent : theme.textMuted;
  return (
    <View style={{ width: 24, height: 24, justifyContent: 'center' }}>
      <View style={{ width: 18, height: 2, backgroundColor: color, borderRadius: 1, marginBottom: 4 }} />
      <View style={{ width: 14, height: 2, backgroundColor: color, borderRadius: 1, marginBottom: 4 }} />
      <View style={{ width: 16, height: 2, backgroundColor: color, borderRadius: 1 }} />
    </View>
  );
}

function SettingsIcon({ focused }: { focused: boolean }) {
  const color = focused ? theme.accent : theme.textMuted;
  return (
    <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 2,
        borderColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 88,
          paddingBottom: 30,
        },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Memos',
          tabBarIcon: ({ focused }) => <MemosIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: '',
          tabBarIcon: ({ focused }) => (
            <View style={styles.recordButtonOuter}>
              <View
                style={[
                  styles.recordButtonInner,
                  focused && styles.recordButtonInnerActive,
                ]}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <SettingsIcon focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  recordButtonOuter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
  },
  recordButtonInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.destructive,
  },
  recordButtonInnerActive: {
    backgroundColor: '#ff5555',
  },
});
