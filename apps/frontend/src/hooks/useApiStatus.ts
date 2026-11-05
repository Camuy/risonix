import { useCallback, useEffect, useRef, useState } from 'react';

export type ServiceState = 'checking' | 'up' | 'down';

export interface ApiStatus {
  state: ServiceState;
  url: string;
  version?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const REQUEST_TIMEOUT_MS = 4000;

/** Verifica lo stato dell'API di import (`GET /api/version`). */
export function useApiStatus() {
  const [status, setStatus] = useState<ApiStatus>({ state: 'checking', url: API_BASE_URL });
  const requestId = useRef(0);

  const check = useCallback(async () => {
    const id = ++requestId.current;
    setStatus({ state: 'checking', url: API_BASE_URL });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE_URL}/api/version`, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as { version?: string };
      if (requestId.current === id) {
        setStatus({ state: 'up', url: API_BASE_URL, version: data.version });
      }
    } catch {
      if (requestId.current === id) {
        setStatus({ state: 'down', url: API_BASE_URL });
      }
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return { status, refresh: check };
}
