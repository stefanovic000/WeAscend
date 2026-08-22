import AsyncStorage from "@react-native-async-storage/async-storage";
import { isWeAscendState, makeInitialState, type PlanOverview, type WeAscendState } from "@weascend/shared";
import { AppState as NativeAppState } from "react-native";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";

import { useAuth } from "@/providers/AuthProvider";
import { apiJson } from "@/services/api";
import { getMobileAuth } from "@/services/firebase";

type CloudStateResponse = {
  state: WeAscendState | null;
  revision: number;
  updatedAt: string | null;
  plan?: PlanOverview;
};

type CachedSnapshot = {
  version: 1;
  userId: string;
  state: WeAscendState;
  revision: number;
  updatedAt: string | null;
  plan: PlanOverview | null;
  cachedAt: string;
};

type CloudStateContextValue = {
  state: WeAscendState | null;
  revision: number;
  plan: PlanOverview | null;
  loading: boolean;
  refreshing: boolean;
  offline: boolean;
  hasCachedData: boolean;
  lastSyncedAt: string | null;
  error: string | null;
  refresh: () => void;
};

const CloudStateContext = createContext<CloudStateContextValue | null>(null);

function cacheKey(userId: string) {
  return `@weascend/cloud-state-v1:${userId}`;
}

function parseCachedSnapshot(raw: string | null, userId: string): CachedSnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CachedSnapshot>;
    if (value.version !== 1 || value.userId !== userId || !isWeAscendState(value.state)) return null;
    return {
      version: 1,
      userId,
      state: value.state,
      revision: Number.isInteger(value.revision) ? Number(value.revision) : 0,
      updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
      plan: value.plan ?? null,
      cachedAt: typeof value.cachedAt === "string" ? value.cachedAt : new Date(0).toISOString(),
    };
  } catch {
    return null;
  }
}

function errorCode(reason: unknown) {
  if (reason && typeof reason === "object" && "code" in reason) return String(reason.code);
  return reason instanceof Error ? reason.message : "cloud_unavailable";
}

export function CloudStateProvider({ children }: PropsWithChildren) {
  const { identity } = useAuth();
  const [state, setState] = useState<WeAscendState | null>(null);
  const [revision, setRevision] = useState(0);
  const [plan, setPlan] = useState<PlanOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [offline, setOffline] = useState(false);
  const [hasCachedData, setHasCachedData] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const requestId = useRef(0);
  const visibleUserId = useRef<string | null>(null);

  const refresh = useCallback(() => setRefreshAttempt(attempt => attempt + 1), []);

  useEffect(() => {
    const userId = identity?.id;
    const currentRequest = ++requestId.current;
    if (!userId || !identity.emailVerified) {
      visibleUserId.current = null;
      setState(null);
      setRevision(0);
      setPlan(null);
      setLoading(false);
      setRefreshing(false);
      setOffline(false);
      setHasCachedData(false);
      setLastSyncedAt(null);
      setError(null);
      return;
    }

    const userChanged = visibleUserId.current !== userId;
    if (userChanged) {
      visibleUserId.current = userId;
      setState(null);
      setRevision(0);
      setPlan(null);
      setHasCachedData(false);
      setLastSyncedAt(null);
      setOffline(false);
    }

    let cancelled = false;
    const active = () => !cancelled && requestId.current === currentRequest;

    void (async () => {
      setLoading(userChanged || state === null);
      setRefreshing(!userChanged && state !== null);
      setError(null);

      const cached = parseCachedSnapshot(await AsyncStorage.getItem(cacheKey(userId)), userId);
      if (active() && cached) {
        setState(cached.state);
        setRevision(cached.revision);
        setPlan(cached.plan);
        setHasCachedData(true);
        setLastSyncedAt(cached.updatedAt ?? cached.cachedAt);
        setLoading(false);
      }

      try {
        const auth = await getMobileAuth();
        if (!auth.currentUser || auth.currentUser.uid !== userId) throw new Error("authentication_required");
        const token = await auth.currentUser.getIdToken();
        const response = await apiJson<CloudStateResponse>("/api/state", {
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` },
        });
        const confirmedState = isWeAscendState(response.state) ? response.state : makeInitialState();
        const savedAt = new Date().toISOString();
        const snapshot: CachedSnapshot = {
          version: 1,
          userId,
          state: confirmedState,
          revision: Number.isInteger(response.revision) ? response.revision : 0,
          updatedAt: response.updatedAt,
          plan: response.plan ?? null,
          cachedAt: savedAt,
        };
        await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(snapshot));
        if (!active()) return;
        setState(confirmedState);
        setRevision(snapshot.revision);
        setPlan(snapshot.plan);
        setHasCachedData(true);
        setLastSyncedAt(response.updatedAt ?? savedAt);
        setOffline(false);
        setError(null);
      } catch (reason) {
        if (!active()) return;
        setOffline(Boolean(cached));
        setError(errorCode(reason));
      } finally {
        if (active()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  // `state` is intentionally excluded: a confirmed response must not trigger another request.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity?.emailVerified, identity?.id, refreshAttempt]);

  useEffect(() => {
    const subscription = NativeAppState.addEventListener("change", nextState => {
      if (nextState === "active" && identity?.emailVerified) refresh();
    });
    return () => subscription.remove();
  }, [identity?.emailVerified, refresh]);

  const value = useMemo<CloudStateContextValue>(() => ({
    state,
    revision,
    plan,
    loading,
    refreshing,
    offline,
    hasCachedData,
    lastSyncedAt,
    error,
    refresh,
  }), [error, hasCachedData, lastSyncedAt, loading, offline, plan, refreshing, refresh, revision, state]);

  return <CloudStateContext.Provider value={value}>{children}</CloudStateContext.Provider>;
}

export function useCloudState() {
  const value = useContext(CloudStateContext);
  if (!value) throw new Error("useCloudState must be used inside CloudStateProvider");
  return value;
}
