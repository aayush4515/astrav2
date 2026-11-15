import { useSyncExternalStore } from "react";
import { api, type HealthStatus } from "../services/api";

/** One shared poll of /api/health for every component that shows system status. */
let snapshot: { health: HealthStatus | null; offline: boolean } = { health: null, offline: false };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

async function load() {
  try {
    snapshot = { health: await api.health(), offline: false };
  } catch {
    snapshot = { ...snapshot, offline: true };
  }
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!timer) {
    load();
    timer = setInterval(load, 8000);
  }
  return () => {
    listeners.delete(fn);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useHealth() {
  return useSyncExternalStore(subscribe, () => snapshot);
}
