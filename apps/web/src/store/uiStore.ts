import { create } from 'zustand';
import { TFL_MODES, type StatusBand, type TfLMode } from '@ldt/shared';

export type SelectionMode = 'line' | 'station' | null;
export type MapColorMode = 'brand' | 'status';

export interface MapFocus {
  lon: number;
  lat: number;
  zoom?: number;
}

interface UiState {
  selectedLineIds: string[];
  selectedStationId: string | null;
  selectionMode: SelectionMode;
  mapColorMode: MapColorMode;
  filtersOpen: boolean;
  detailsOpen: boolean;
  selectedModes: TfLMode[];
  statusBand: StatusBand | 'all';
  onlyLifts: boolean;
  onlyToilets: boolean;
  onlyWifi: boolean;
  searchQuery: string;
  showBoroughs: boolean;
  focus: MapFocus | null;
  toggleLineSelection: (lineId: string) => void;
  selectLine: (lineId: string) => void;
  selectStation: (stationId: string) => void;
  clearSelection: () => void;
  setMapColorMode: (mode: MapColorMode) => void;
  setFiltersOpen: (open: boolean) => void;
  setDetailsOpen: (open: boolean) => void;
  toggleMode: (mode: TfLMode) => void;
  setStatusBand: (band: StatusBand | 'all') => void;
  setOnlyLifts: (value: boolean) => void;
  setOnlyToilets: (value: boolean) => void;
  setOnlyWifi: (value: boolean) => void;
  setSearchQuery: (query: string) => void;
  setShowBoroughs: (value: boolean) => void;
  setFocus: (focus: MapFocus | null) => void;
}

const MAX_COMPARISON_LINES = 3;

export const useUiStore = create<UiState>((set) => ({
  selectedLineIds: [],
  selectedStationId: null,
  selectionMode: null,
  mapColorMode: 'brand',
  filtersOpen: true,
  detailsOpen: true,
  selectedModes: [...TFL_MODES],
  statusBand: 'all',
  onlyLifts: false,
  onlyToilets: false,
  onlyWifi: false,
  searchQuery: '',
  showBoroughs: false,
  focus: null,

  toggleLineSelection: (lineId) =>
    set((state) => {
      const isSelected = state.selectedLineIds.includes(lineId);
      if (isSelected) {
        const next = state.selectedLineIds.filter((id) => id !== lineId);
        return {
          selectedLineIds: next,
          selectedStationId: null,
          selectionMode: next.length > 0 ? 'line' : null,
          detailsOpen: next.length > 0,
        };
      }

      const next = [...state.selectedLineIds, lineId].slice(-MAX_COMPARISON_LINES);
      return {
        selectedLineIds: next,
        selectedStationId: null,
        selectionMode: 'line',
        detailsOpen: true,
      };
    }),

  selectLine: (lineId) =>
    set({
      selectedLineIds: [lineId],
      selectedStationId: null,
      selectionMode: 'line',
      detailsOpen: true,
    }),

  selectStation: (stationId) =>
    set({
      selectedStationId: stationId,
      selectedLineIds: [],
      selectionMode: 'station',
      detailsOpen: true,
    }),

  clearSelection: () =>
    set({
      selectedLineIds: [],
      selectedStationId: null,
      selectionMode: null,
    }),

  setMapColorMode: (mapColorMode) => set({ mapColorMode }),
  setFiltersOpen: (filtersOpen) => set({ filtersOpen }),
  setDetailsOpen: (detailsOpen) => set({ detailsOpen }),

  toggleMode: (mode) =>
    set((state) => {
      const hasMode = state.selectedModes.includes(mode);
      const next = hasMode
        ? state.selectedModes.filter((candidate) => candidate !== mode)
        : [...state.selectedModes, mode];
      return { selectedModes: next.length === 0 ? [...TFL_MODES] : next };
    }),

  setStatusBand: (statusBand) => set({ statusBand }),
  setOnlyLifts: (onlyLifts) => set({ onlyLifts }),
  setOnlyToilets: (onlyToilets) => set({ onlyToilets }),
  setOnlyWifi: (onlyWifi) => set({ onlyWifi }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setShowBoroughs: (showBoroughs) => set({ showBoroughs }),
  setFocus: (focus) => set({ focus }),
}));
