import { z } from 'zod';
import { API_URL } from './config';

/** How long `checkHealth` waits before treating the API as unreachable. */
export const HEALTH_TIMEOUT_MS = 5000;

const HealthResponseSchema = z.object({ ok: z.literal(true) });

/**
 * Calls `GET /health` on the worker.
 * Resolves to true only for a 2xx response with body `{ ok: true }`; any network error,
 * timeout or unexpected body resolves to false (never throws).
 */
export async function checkHealth(timeoutMs: number = HEALTH_TIMEOUT_MS): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_URL}/health`, { signal: controller.signal });
    if (!response.ok) {
      return false;
    }
    const body: unknown = await response.json();
    return HealthResponseSchema.safeParse(body).success;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
