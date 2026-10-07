import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

const STATION_KEY = 'rpos.kds.station';

interface StationFilterState {
  /** The station this kitchen screen shows; '' shows every station. */
  station: string;
  setStation: (stationId: string) => void;
}

type Persisted = Pick<StationFilterState, 'station'>;

/**
 * Keeps the bare station id, the format kitchen screens already have saved. Blocked storage
 * (private mode, cleared site data) only means the filter resets on reload.
 */
const stationStorage: PersistStorage<Persisted> = {
  getItem: (name) => {
    try {
      return { state: { station: localStorage.getItem(name) ?? '' }, version: 0 };
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value.state.station);
    } catch {
      // Storage blocked: keep the choice in memory only.
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Storage blocked: nothing was saved.
    }
  },
};

/** The KDS station filter, remembered per screen. Hydrated when the board mounts. */
export const useStationFilter = create<StationFilterState>()(
  persist((set) => ({ station: '', setStation: (station) => set({ station }) }), {
    name: STATION_KEY,
    storage: stationStorage,
    partialize: (state) => ({ station: state.station }),
    skipHydration: true,
  }),
);
