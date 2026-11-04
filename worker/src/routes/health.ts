import { json } from '../http';

/** `GET /health` — lets the frontend check that the API is reachable. */
export function handleHealth(): Response {
  return json({ ok: true });
}
