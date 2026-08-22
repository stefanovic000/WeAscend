import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/providers/AuthProvider";
import { usePreferences } from "@/providers/PreferencesProvider";
import { API_BASE_URL } from "@/services/api";
import { colors, radius, spacing } from "@/theme";

type AuthMode = "signin" | "register";

const copy = {
  en: {
    eyebrow: "WEASCEND ACCOUNT",
    signinTitle: "Enter the system",
    registerTitle: "Create your account",
    signinText: "Your progress stays private and follows you across your devices.",
    registerText: "Begin with an empty path: no quests and 0 XP.",
    signinTab: "Log in",
    registerTab: "Create account",
    email: "EMAIL",
    password: "PASSWORD",
    emailPlaceholder: "you@example.com",
    passwordPlaceholder: "At least 6 characters",
    signin: "Enter WeAscend",
    register: "Create account",
    forgot: "Forgot password?",
    resetSent: "If that account exists, reset instructions were sent.",
    invalidEmail: "Enter a valid email address.",
    shortPassword: "Password must contain at least 6 characters.",
    emailInUse: "This email already has an account. Choose Log in.",
    invalidCredentials: "Email or password is incorrect.",
    tooMany: "Too many attempts. Wait a moment and try again.",
    network: "Connection failed. Check your internet and try again.",
    disabled: "This account has been disabled.",
    generic: "This action could not be completed. Check the details and try again.",
    setupTitle: "The system cannot connect",
    setupText: "WeAscend could not load its secure account configuration. Check your connection and retry.",
    retry: "Try again",
    privacy: "Privacy",
    terms: "Terms",
    language: "SR",
  },
  sr: {
    eyebrow: "WEASCEND NALOG",
    signinTitle: "Uđi u sistem",
    registerTitle: "Napravi nalog",
    signinText: "Tvoj napredak ostaje privatan i prati te na svim uređajima.",
    registerText: "Počni sa praznim putem: bez questova i sa 0 XP.",
    signinTab: "Prijava",
    registerTab: "Napravi nalog",
    email: "EMAIL",
    password: "LOZINKA",
    emailPlaceholder: "ti@primer.com",
    passwordPlaceholder: "Najmanje 6 karaktera",
    signin: "Uđi u WeAscend",
    register: "Napravi nalog",
    forgot: "Zaboravljena lozinka?",
    resetSent: "Ako nalog postoji, poslata su uputstva za novu lozinku.",
    invalidEmail: "Unesi ispravnu email adresu.",
    shortPassword: "Lozinka mora imati najmanje 6 karaktera.",
    emailInUse: "Ovaj email već ima nalog. Izaberi Prijava.",
    invalidCredentials: "Email ili lozinka nisu ispravni.",
    tooMany: "Previše pokušaja. Sačekaj malo i pokušaj ponovo.",
    network: "Veza nije uspela. Proveri internet i pokušaj ponovo.",
    disabled: "Ovaj nalog je onemogućen.",
    generic: "Radnja nije završena. Proveri podatke i pokušaj ponovo.",
    setupTitle: "Sistem ne može da se poveže",
    setupText: "WeAscend nije učitao bezbednu konfiguraciju naloga. Proveri vezu i pokušaj ponovo.",
    retry: "Pokušaj ponovo",
    privacy: "Privatnost",
    terms: "Uslovi",
    language: "EN",
  },
} as const;

function codeFrom(reason: unknown) {
  return reason && typeof reason === "object" && "code" in reason ? String(reason.code) : "";
}

export default function SignInScreen() {
  const { configurationError, register, retryConfiguration, sendPasswordReset, signIn } = useAuth();
  const { language, setLanguage } = usePreferences();
  const t = copy[language];
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const errorMessage = (reason: unknown) => {
    const code = codeFrom(reason);
    if (code === "auth/invalid-email") return t.invalidEmail;
    if (code === "auth/weak-password") return t.shortPassword;
    if (code === "auth/email-already-in-use") return t.emailInUse;
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") return t.invalidCredentials;
    if (code === "auth/too-many-requests" || code === "email_rate_limited") return t.tooMany;
    if (code === "auth/network-request-failed" || code.startsWith("http_")) return t.network;
    if (code === "auth/user-disabled") return t.disabled;
    return t.generic;
  };

  const selectMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword("");
    setError("");
    setMessage("");
  };

  const validEmail = /^\S+@\S+\.\S+$/.test(email.trim());

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    if (!validEmail) {
      setError(t.invalidEmail);
      return;
    }
    if (password.length < 6) {
      setError(t.shortPassword);
      return;
    }
    void run(() => mode === "signin" ? signIn(email, password) : register(email, password, language));
  };

  if (configurationError) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.connectionState}>
          <Ionicons color={colors.danger} name="cloud-offline-outline" size={38} />
          <Text style={styles.connectionTitle}>{t.setupTitle}</Text>
          <Text style={styles.connectionText}>{t.setupText}</Text>
          <Pressable onPress={retryConfiguration} style={styles.primaryButton}>
            <Text style={styles.primaryLabel}>{t.retry}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentContainerStyle={styles.scroll}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topLine}>
            <View style={styles.emblem}><Text style={styles.mark}>W</Text></View>
            <Pressable
              accessibilityLabel={language === "en" ? "Switch to Serbian" : "Prebaci na engleski"}
              onPress={() => setLanguage(language === "en" ? "sr" : "en")}
              style={styles.languageButton}
            >
              <Text style={styles.languageText}>{t.language}</Text>
            </Pressable>
          </View>

          <Text style={styles.eyebrow}>{t.eyebrow}</Text>
          <Text style={styles.title}>{mode === "signin" ? t.signinTitle : t.registerTitle}</Text>
          <Text style={styles.intro}>{mode === "signin" ? t.signinText : t.registerText}</Text>

          <View accessibilityRole="tablist" style={styles.modeSwitch}>
            <Pressable onPress={() => selectMode("signin")} style={[styles.modeButton, mode === "signin" && styles.modeActive]}>
              <Text style={[styles.modeLabel, mode === "signin" && styles.modeLabelActive]}>{t.signinTab}</Text>
            </Pressable>
            <Pressable onPress={() => selectMode("register")} style={[styles.modeButton, mode === "register" && styles.modeActive]}>
              <Text style={[styles.modeLabel, mode === "register" && styles.modeLabelActive]}>{t.registerTab}</Text>
            </Pressable>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t.email}</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                onChangeText={value => { setEmail(value); setError(""); setMessage(""); }}
                placeholder={t.emailPlaceholder}
                placeholderTextColor={colors.textMuted}
                spellCheck={false}
                style={styles.input}
                value={email}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t.password}</Text>
              <View style={styles.passwordField}>
                <TextInput
                  autoCapitalize="none"
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  onChangeText={value => { setPassword(value); setError(""); setMessage(""); }}
                  onSubmitEditing={submit}
                  placeholder={t.passwordPlaceholder}
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!passwordVisible}
                  style={styles.passwordInput}
                  value={password}
                />
                <Pressable accessibilityLabel={passwordVisible ? "Hide password" : "Show password"} onPress={() => setPasswordVisible(value => !value)}>
                  <Ionicons color={colors.textMuted} name={passwordVisible ? "eye-off-outline" : "eye-outline"} size={22} />
                </Pressable>
              </View>
            </View>

            {mode === "signin" ? (
              <Pressable
                disabled={busy || !validEmail}
                onPress={() => void run(async () => {
                  await sendPasswordReset(email, language);
                  setMessage(t.resetSent);
                })}
              >
                <Text style={[styles.forgot, (!validEmail || busy) && styles.disabledText]}>{t.forgot}</Text>
              </Pressable>
            ) : null}

            <Pressable disabled={busy} onPress={submit} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed, busy && styles.disabledButton]}>
              {busy ? <ActivityIndicator color={colors.text} /> : <Text style={styles.primaryLabel}>{mode === "signin" ? t.signin : t.register}</Text>}
            </Pressable>

            {message ? <Text style={styles.success}>{message}</Text> : null}
            {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          </View>

          <View style={styles.legal}>
            <Pressable onPress={() => void Linking.openURL(`${API_BASE_URL}/privacy`)}><Text style={styles.legalText}>{t.privacy}</Text></Pressable>
            <View style={styles.legalDot} />
            <Pressable onPress={() => void Linking.openURL(`${API_BASE_URL}/terms`)}><Text style={styles.legalText}>{t.terms}</Text></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  topLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  emblem: { width: 50, height: 50, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.violet, transform: [{ rotate: "45deg" }] },
  mark: { color: colors.violetSoft, fontSize: 21, fontWeight: "800", transform: [{ rotate: "-45deg" }] },
  languageButton: { minWidth: 44, minHeight: 38, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill },
  languageText: { color: colors.textMuted, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  eyebrow: { color: colors.violetSoft, fontSize: 10, fontWeight: "700", letterSpacing: 2 },
  title: { marginTop: spacing.xs, color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: "700" },
  intro: { marginTop: spacing.sm, color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  modeSwitch: { marginTop: spacing.lg, padding: 4, flexDirection: "row", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  modeButton: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  modeActive: { backgroundColor: colors.surfaceRaised },
  modeLabel: { color: colors.textMuted, fontSize: 14, fontWeight: "700" },
  modeLabelActive: { color: colors.text },
  form: { marginTop: spacing.lg, gap: spacing.md },
  field: { gap: spacing.xs },
  fieldLabel: { color: colors.violetSoft, fontSize: 10, fontWeight: "700", letterSpacing: 1.3 },
  input: { minHeight: 54, paddingHorizontal: spacing.md, color: colors.text, fontSize: 16, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  passwordField: { minHeight: 54, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  passwordInput: { flex: 1, color: colors.text, fontSize: 16 },
  forgot: { alignSelf: "flex-end", color: colors.violetSoft, fontSize: 13, fontWeight: "600" },
  disabledText: { opacity: 0.4 },
  primaryButton: { minHeight: 54, alignItems: "center", justifyContent: "center", backgroundColor: colors.violet, borderRadius: radius.md, paddingHorizontal: spacing.md },
  primaryLabel: { color: colors.text, fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabledButton: { opacity: 0.6 },
  success: { color: colors.cyan, fontSize: 13, lineHeight: 19, textAlign: "center" },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: "center" },
  legal: { marginTop: spacing.xl, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm },
  legalText: { color: colors.textMuted, fontSize: 12 },
  legalDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.border },
  connectionState: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, paddingHorizontal: spacing.xl },
  connectionTitle: { color: colors.text, fontSize: 24, fontWeight: "700", textAlign: "center" },
  connectionText: { color: colors.textMuted, fontSize: 15, lineHeight: 22, textAlign: "center" },
});
