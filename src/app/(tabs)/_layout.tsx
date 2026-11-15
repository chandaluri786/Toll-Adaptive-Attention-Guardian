// OWNER: all three, written at hour 0. Tabs: Today (B), Forecast (A), Settings (C).
// The tab bar follows design 2.1: Lucide icons, a soft pill behind the selected tab, theme colours only.
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { useTheme, useThemeMode } from '../../ui/components';
import { Icon, type IconName } from '../../ui/Icon';
import { fonts } from '../../ui/theme';

const ICON_SIZE = 22;

/** Same colours as the tab bar's tint, read from the theme (Icon needs a plain string). */
function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  const t = useTheme();
  const mode = useThemeMode();
  const pill = mode === 'dark' ? t.surface : t.primaryBg;
  return (
    <View style={[styles.pill, focused && { backgroundColor: pill }]}>
      <Icon name={name} size={ICON_SIZE} color={focused ? t.text : t.muted} />
    </View>
  );
}

const tabIcon =
  (name: IconName) =>
  ({ focused }: { focused: boolean }) => <TabIcon name={name} focused={focused} />;

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.text,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.bg, borderTopColor: t.divider },
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 13 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today', tabBarIcon: tabIcon('sun') }} />
      <Tabs.Screen name="forecast" options={{ title: 'Forecast', tabBarIcon: tabIcon('calendar-days') }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: tabIcon('settings') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  pill: { minWidth: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
