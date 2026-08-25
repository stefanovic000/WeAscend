import { Ionicons } from "@expo/vector-icons";
import { type Href, Tabs, useRouter } from "expo-router";
import { useRef, useState } from "react";
import { Animated, Modal, Pressable, StyleSheet, Text, View, type ColorValue } from "react-native";
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
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const quickCreateAnimation = useRef(new Animated.Value(0)).current;
  const longPressTriggered = useRef(false);

  const openQuickCreate = () => {
    if (offline) return;
    longPressTriggered.current = true;
    setQuickCreateOpen(true);
    quickCreateAnimation.setValue(0);
    Animated.spring(quickCreateAnimation, {
      toValue: 1,
      damping: 18,
      stiffness: 260,
      mass: 0.75,
      useNativeDriver: true,
    }).start();
  };

  const closeQuickCreate = (destination?: Href) => {
    Animated.timing(quickCreateAnimation, {
      toValue: 0,
      duration: 120,
      useNativeDriver: true,
    }).start(() => {
      setQuickCreateOpen(false);
      if (destination) router.push(destination);
    });
  };

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
        options={{
          title: "",
          tabBarButton: (props) => (
            <View style={styles.createSlot}>
              <OnboardingTarget targetId="create_quest" style={styles.createTarget}>
                <Pressable
                  accessibilityLabel={sr ? "Napravi quest" : "Create quest"}
                  accessibilityHint={sr ? "Dodir za novi quest, duži pritisak za dodatne opcije" : "Tap for a new quest, hold for more options"}
                  accessibilityRole="button"
                  delayLongPress={350}
                  disabled={offline}
                  onLongPress={openQuickCreate}
                  onPress={() => {
                    if (longPressTriggered.current) {
                      longPressTriggered.current = false;
                      return;
                    }
                    if (!offline) router.push("/quest/new" as Href);
                  }}
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
      <Modal
        animationType="none"
        onRequestClose={() => closeQuickCreate()}
        transparent
        visible={quickCreateOpen}
      >
        <View style={styles.quickCreateLayer}>
          <Pressable accessibilityLabel={sr ? "Zatvori" : "Close"} onPress={() => closeQuickCreate()} style={StyleSheet.absoluteFill} />
          <Animated.View
            style={[
              styles.quickCreateCard,
              {
                bottom: 76 + bottomInset,
                opacity: quickCreateAnimation,
                transform: [
                  { translateY: quickCreateAnimation.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) },
                  { scale: quickCreateAnimation.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                ],
              },
            ]}
          >
            <View style={styles.quickCreateHeader}>
              <View>
                <Text style={styles.quickCreateEyebrow}>{sr ? "BRZO KREIRANJE" : "QUICK CREATE"}</Text>
                <Text style={styles.quickCreateHint}>{sr ? "Običan dodir na + otvara novi quest" : "A regular tap on + opens a new quest"}</Text>
              </View>
              <Pressable accessibilityLabel={sr ? "Zatvori" : "Close"} hitSlop={10} onPress={() => closeQuickCreate()}>
                <Ionicons color={colors.textMuted} name="close" size={22} />
              </Pressable>
            </View>
            <QuickCreateAction
              icon="add-circle-outline"
              label={sr ? "Novi quest" : "New quest"}
              onPress={() => closeQuickCreate("/quest/new" as Href)}
            />
            <QuickCreateAction
              icon="copy-outline"
              label={sr ? "Napravi iz template-a" : "Create from template"}
              onPress={() => closeQuickCreate("/templates?mode=use" as Href)}
            />
            <QuickCreateAction
              icon="flame-outline"
              label={sr ? "Novi Boss Quest" : "New Boss Quest"}
              onPress={() => closeQuickCreate("/quest/new?type=Boss" as Href)}
              tone="boss"
            />
          </Animated.View>
        </View>
      </Modal>
      <OnboardingTour />
    </View>
  );
}

function QuickCreateAction({
  icon,
  label,
  onPress,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  tone?: "boss";
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quickCreateAction, pressed && styles.quickCreateActionPressed]}>
      <View style={[styles.quickCreateIcon, tone === "boss" && styles.quickCreateIconBoss]}>
        <Ionicons color={tone === "boss" ? colors.danger : colors.cyan} name={icon} size={22} />
      </View>
      <Text style={styles.quickCreateLabel}>{label}</Text>
      <Ionicons color={colors.textMuted} name="chevron-forward" size={18} />
    </Pressable>
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
    marginTop: -20,
  },
  createTarget: {
    width: 58,
    height: 58,
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
  quickCreateLayer: {
    flex: 1,
    backgroundColor: "rgba(3, 4, 12, 0.58)",
  },
  quickCreateCard: {
    position: "absolute",
    left: 18,
    right: 18,
    padding: 14,
    borderRadius: 22,
    backgroundColor: "#131528",
    borderColor: "rgba(139, 111, 255, 0.65)",
    borderWidth: 1,
    shadowColor: colors.violet,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  quickCreateHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  quickCreateEyebrow: {
    color: colors.violetSoft,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  quickCreateHint: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  quickCreateAction: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 8,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  quickCreateActionPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.985 }],
  },
  quickCreateIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(45, 218, 214, 0.1)",
  },
  quickCreateIconBoss: {
    backgroundColor: "rgba(255, 82, 115, 0.1)",
  },
  quickCreateLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
});
