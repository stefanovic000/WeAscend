import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { Pressable, StyleSheet, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCloudState } from "@/providers/CloudStateProvider";
import { OnboardingTour } from "@/components/OnboardingTour";
import { OnboardingTarget } from "@/components/OnboardingTarget";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors } from "@/theme";

type TabIconProps = {
  color: ColorValue;
  focused: boolean;
  name: keyof typeof Ionicons.glyphMap;
  activeName: keyof typeof Ionicons.glyphMap;
};

function TabIcon({ color, focused, name, activeName }: TabIconProps) {
  return <Ionicons color={color} name={focused ? activeName : name} size={23} />;
}

export default function TabLayout() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { offline } = useCloudState();
  const { language } = usePreferences();
  const sr = language === "sr";
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <View style={styles.root}>
      <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.violetSoft,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: [
          styles.tabBar,
          {
            height: 64 + bottomInset,
            paddingBottom: bottomInset,
          },
        ],
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: sr ? "Danas" : "Today",
          tabBarIcon: (props) => <TabIcon {...props} name="today-outline" activeName="today" />,
        }}
      />
      <Tabs.Screen
        name="quests"
        options={{
          title: sr ? "Plan" : "Plan",
          tabBarIcon: (props) => <TabIcon {...props} name="calendar-outline" activeName="calendar" />,
        }}
      />
      <Tabs.Screen
        name="create"
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            if (!offline) router.push("/quest/new");
          },
        }}
        options={{
          title: "",
          tabBarButton: (props) => (
            <View style={styles.createSlot}>
              <OnboardingTarget targetId="create_quest" style={styles.createTarget}>
                <Pressable
                  accessibilityLabel={sr ? "Napravi quest" : "Create quest"}
                  accessibilityRole="button"
                  disabled={offline}
                  onPress={props.onPress}
                  style={({ pressed }) => [styles.createButton, offline && styles.createDisabled, pressed && styles.createPressed]}
                >
                  <Ionicons color={colors.text} name="add" size={30} />
                </Pressable>
              </OnboardingTarget>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: sr ? "Napredak" : "Progress",
          tabBarIcon: (props) => <TabIcon {...props} name="git-network-outline" activeName="git-network" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: sr ? "Profil" : "Profile",
          tabBarIcon: (props) => <TabIcon {...props} name="person-outline" activeName="person" />,
        }}
      />
      </Tabs>
      <OnboardingTour />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabBar: {
    paddingTop: 8,
    backgroundColor: "#0b0d19",
    borderTopColor: colors.border,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
  },
  createSlot: {
    flex: 1,
    alignItems: "center",
  },
  createTarget: {
    width: 58,
    height: 58,
    marginTop: -20,
    borderRadius: 29,
  },
  createButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.violet,
    borderColor: "#c3b6ff",
    borderWidth: 1,
    shadowColor: colors.violet,
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  createPressed: {
    transform: [{ scale: 0.94 }],
  },
  createDisabled: { opacity: 0.45 },
});
