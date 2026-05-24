import "./_init";

import { create } from "zustand";

export interface UiState {
  selectedSignalKey: string | null;
  setSelectedSignalKey(key: string | null): void;
  clearSelectedSignalKey(): void;
}

export const useUiStore = create<UiState>()((set) => ({
  selectedSignalKey: null,
  setSelectedSignalKey: (key) => set({ selectedSignalKey: key }),
  clearSelectedSignalKey: () => set({ selectedSignalKey: null }),
}));

export const selectSelectedSignalKey = (state: UiState): string | null =>
  state.selectedSignalKey;

export const useSelectedSignalKey = () =>
  useUiStore(selectSelectedSignalKey);
