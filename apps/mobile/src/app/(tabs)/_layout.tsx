import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import { Pressable, StyleSheet, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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
  const bottomInset = Math.max(insets.bottom, 8);

  return (
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
          title: "Today",
          tabBarIcon: (props) => <TabIcon {...props} name="today-outline" activeName="today" />,
        }}
      />
      <Tabs.Screen
        name="quests"
        options={{
          title: "Quests",
          tabBarIcon: (props) => <TabIcon {...props} name="checkbox-outline" activeName="checkbox" />,
        }}
      />
      <Tabs.Screen
        name="create"
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            router.push("/quest/new");
          },
        }}
        options={{
          title: "",
          tabBarButton: (props) => (
            <View style={styles.createSlot}>
              <Pressable
                accessibilityLabel="Create quest"
                accessibilityRole="button"
                onPress={props.onPress}
                style={({ pressed }) => [styles.createButton, pressed && styles.createPressed]}
              >
                <Ionicons color={colors.text} name="add" size={30} />
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: "Progress",
          tabBarIcon: (props) => <TabIcon {...props} name="git-network-outline" activeName="git-network" />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: (props) => <TabIcon {...props} name="person-outline" activeName="person" />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
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
  createButton: {
    width: 58,
    height: 58,
    marginTop: -20,
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
});
