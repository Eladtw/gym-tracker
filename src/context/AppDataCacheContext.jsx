import { createContext, useContext, useMemo, useState } from "react";

const AppDataCacheContext = createContext(null);

export function AppDataCacheProvider({ children }) {
  const [cache, setCacheState] = useState({});

  function getCache(key) {
    return cache[key] ?? null;
  }

  function setCache(key, data) {
    setCacheState((prev) => ({
      ...prev,
      [key]: {
        data,
        updatedAt: Date.now(),
      },
    }));
  }

  function removeCache(key) {
    setCacheState((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function clearCache() {
    setCacheState({});
  }

  const value = useMemo(
    () => ({
      getCache,
      setCache,
      removeCache,
      clearCache,
    }),
    [cache]
  );

  return (
    <AppDataCacheContext.Provider value={value}>
      {children}
    </AppDataCacheContext.Provider>
  );
}

export function useAppDataCache() {
  const ctx = useContext(AppDataCacheContext);
  if (!ctx) {
    throw new Error("useAppDataCache must be used inside AppDataCacheProvider");
  }
  return ctx;
}