import { create } from 'zustand';

export type RealtimeStatus = 'unconfigured' | 'connecting' | 'subscribed' | 'error';

interface RealtimeState {
  status: RealtimeStatus;
  lastEventAt: string | null;
  setStatus: (status: RealtimeStatus) => void;
  markEvent: () => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  status: 'unconfigured',
  lastEventAt: null,
  setStatus: (status) => set({ status }),
  markEvent: () => set({ lastEventAt: new Date().toISOString() }),
}));
