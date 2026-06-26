import { create } from 'zustand';
import type { Startup } from '../services/api';

interface StartupStore {
  startups: Startup[];
  currentStartup: Startup | null;
  isLoading: boolean;
  error: string | null;

  setStartups: (startups: Startup[]) => void;
  setCurrentStartup: (startup: Startup | null) => void;
  addStartup: (startup: Startup) => void;
  updateStartup: (id: string, updates: Partial<Startup>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useStartupStore = create<StartupStore>((set) => ({
  startups: [],
  currentStartup: null,
  isLoading: false,
  error: null,

  setStartups: (startups) => set({ startups }),
  setCurrentStartup: (startup) => set({ currentStartup: startup }),
  addStartup: (startup) => set((state) => ({ startups: [startup, ...state.startups] })),
  updateStartup: (id, updates) => set((state) => ({
    startups: state.startups.map((s) => s.id === id ? { ...s, ...updates } : s),
    currentStartup: state.currentStartup?.id === id ? { ...state.currentStartup, ...updates } : state.currentStartup,
  })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
