import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/providers/AuthProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { colors, radius, spacing } from "@/theme";

const copy = {
  en: {
    eyebrow: "VERIFY YOUR ACCOUNT",
    title: "Check your inbox",
    text: "We sent a secure verification link to",
    instruction: "Open the link, then return here. WeAscend will also check automatically when the app becomes active.",
    verified: "I have verified my email",
    checking: "Checking…",
    notYet: "The email is not verified yet. Open the newest link and try again.",
    resend: "Send another link",
    resent: "A new verification link was sent.",
    wait: "Please wait before requesting another link.",
    signOut: "Use another account",
  },
  sr: {
    eyebrow: "POTVRDI NALOG",
    title: "Proveri inbox",
    text: "Poslali smo bezbedan link za potvrdu na",
    instruction: "Otvori link, pa se vrati ovde. WeAscend proverava automatski i kada aplikacija ponovo postane aktivna.",
    verified: "Potvrdio sam email",
    checking: "Proveravam…",
    notYet: "Email još nije potvrđen. Otvori najnoviji link i pokušaj ponovo.",
    resend: "Pošalji novi link",
    resent: "Poslat je novi link za potvrdu.",
    wait: "Sačekaj pre nego što zatražiš novi link.",
    signOut: "Koristi drugi nalog",
  },
} as const;

function codeFrom(reason: unknown) {
  return reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
}

export default function VerifyEmailScreen() {
  const { identity, refreshVerification, resendVerification, signOut } = useAuth();
  const { language } = usePreferences();
  const t = copy[language];
  const [busy, setBusy] = useState<"check" | "resend" | "signout" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const check = async () => {
    setBusy("check");
    setMessage("");
    setError("");
    try {
      const verified = await refreshVerification();
      if (!verified) setError(t.notYet);
    } catch {
      setError(t.notYet);
    } finally {
      setBusy(null);
    }
  };

  const resend = async () => {
    setBusy("resend");
    setMessage("");
    setError("");
    try {
      await resendVerification(language);
      setMessage(t.resent);
    } catch (reason) {
      setError(codeFrom(reason) === "email_rate_limited" ? t.wait : t.notYet);
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.iconWrap}>
          <Ionicons color={colors.violetSoft} name="mail-unread-outline" size={38} />
        </View>
        <Text style={styles.eyebrow}>{t.eyebrow}</Text>
        <Text style={styles.title}>{t.title}</Text>
        <Text style={styles.body}>{t.text}</Text>
        <Text style={styles.email}>{identity?.email}</Text>
        <Text style={styles.instruction}>{t.instruction}</Text>

        <Pressable disabled={Boolean(busy)} onPress={() => void check()} style={styles.primaryButton}>
          {busy === "check" ? <ActivityIndicator color={colors.text} /> : <Text style={styles.primaryLabel}>{t.verified}</Text>}
        </Pressable>
        <Pressable disabled={Boolean(busy)} onPress={() => void resend()} style={styles.secondaryButton}>
          {busy === "resend" ? <ActivityIndicator color={colors.violetSoft} /> : <Text style={styles.secondaryLabel}>{t.resend}</Text>}
        </Pressable>

        {message ? <Text style={styles.success}>{message}</Text> : null}
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}

        <Pressable
          disabled={Boolean(busy)}
          onPress={() => {
            setBusy("signout");
            void signOut().finally(() => setBusy(null));
          }}
        >
          <Text style={styles.signOut}>{t.signOut}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: spacing.lg },
  iconWrap: { width: 74, height: 74, alignItems: "center", justifyContent: "center", borderRadius: 37, backgroundColor: "#201b42", borderWidth: 1, borderColor: colors.violet, marginBottom: spacing.lg },
  eyebrow: { color: colors.violetSoft, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  title: { marginTop: spacing.xs, color: colors.text, fontSize: 30, fontWeight: "700", textAlign: "center" },
  body: { marginTop: spacing.md, color: colors.textMuted, fontSize: 15, textAlign: "center" },
  email: { marginTop: spacing.xs, color: colors.cyan, fontSize: 16, fontWeight: "700", textAlign: "center" },
  instruction: { marginVertical: spacing.lg, color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  primaryButton: { width: "100%", minHeight: 54, alignItems: "center", justifyContent: "center", backgroundColor: colors.violet, borderRadius: radius.md },
  primaryLabel: { color: colors.text, fontSize: 15, fontWeight: "800" },
  secondaryButton: { width: "100%", minHeight: 50, marginTop: spacing.sm, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  secondaryLabel: { color: colors.violetSoft, fontSize: 14, fontWeight: "700" },
  success: { marginTop: spacing.md, color: colors.cyan, fontSize: 13, lineHeight: 19, textAlign: "center" },
  error: { marginTop: spacing.md, color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: "center" },
  signOut: { marginTop: spacing.lg, color: colors.textMuted, fontSize: 13, textDecorationLine: "underline" },
});
