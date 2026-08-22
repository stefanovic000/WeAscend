import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";

export type AppLanguage = "en" | "sr";

type PreferencesContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
};

const LANGUAGE_KEY = "@weascend/language-v1";
const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: PropsWithChildren) {
  const [language, setLanguageState] = useState<AppLanguage>("en");

  useEffect(() => {
    void AsyncStorage.getItem(LANGUAGE_KEY).then(value => {
      if (value === "en" || value === "sr") setLanguageState(value);
    });
  }, []);

  const setLanguage = (nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage);
    void AsyncStorage.setItem(LANGUAGE_KEY, nextLanguage);
  };

  const value = useMemo(() => ({ language, setLanguage }), [language]);
  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error("usePreferences must be used inside PreferencesProvider");
  return value;
}
