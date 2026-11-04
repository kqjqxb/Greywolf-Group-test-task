import { useEffect, useState } from 'react';
import { checkHealth } from '../api/client';

// TODO(Stage 2): remove this temporary connection indicator (Stage 1 walking skeleton only).

type Status = 'checking' | 'online' | 'offline';

const LABELS: Record<Status, string> = {
  checking: 'Sprawdzanie połączenia z API…',
  online: 'Połączono z API',
  offline: 'Brak połączenia z API',
};

export function ApiStatus() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    // Ignore the result if the component unmounted (e.g. StrictMode double effect in dev).
    let cancelled = false;
    void checkHealth().then((ok) => {
      if (!cancelled) {
        setStatus(ok ? 'online' : 'offline');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <p className={`api-status api-status--${status}`} role="status">
      {LABELS[status]}
    </p>
  );
}
