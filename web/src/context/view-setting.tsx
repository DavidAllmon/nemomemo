import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export interface ViewSetting {
  layout: 'list' | '2col' | '3col' | 'auto';
  orderBy: 'created_ts' | 'updated_ts';
  direction: 'asc' | 'desc';
  compact: boolean;
}

const DEFAULT: ViewSetting = { layout: 'list', orderBy: 'created_ts', direction: 'desc', compact: false };
const STORAGE_KEY = 'nemo-view-setting';

const ViewSettingContext = createContext<{
  setting: ViewSetting;
  update: (patch: Partial<ViewSetting>) => void;
}>({ setting: DEFAULT, update: () => {} });

export function ViewSettingProvider({ children }: { children: ReactNode }) {
  const [setting, setSetting] = useState<ViewSetting>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return { ...DEFAULT, ...(JSON.parse(stored) as Partial<ViewSetting>) };
    } catch {
      // ignore
    }
    return DEFAULT;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(setting));
    } catch {
      // ignore
    }
  }, [setting]);

  return (
    <ViewSettingContext.Provider
      value={{ setting, update: (patch) => setSetting((prev) => ({ ...prev, ...patch })) }}
    >
      {children}
    </ViewSettingContext.Provider>
  );
}

export function useViewSetting() {
  return useContext(ViewSettingContext);
}
