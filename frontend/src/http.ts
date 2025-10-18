export type TimeoutInit = RequestInit & { timeoutMs?: number };

export async function fetchWithTimeout(input: RequestInfo | URL, init: TimeoutInit = {}): Promise<Response> {
  const { timeoutMs = 10000, signal, ...rest } = init;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If a caller provided a signal, we need to abort on either signal
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

export async function fetchJsonWithRetry<T = any>(
  input: RequestInfo | URL,
  init: TimeoutInit = {},
  options: { retries?: number; retryDelayMs?: number } = {}
): Promise<T> {
  const { retries = 2, retryDelayMs = 400 } = options;

  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(input, init);
      if (!res.ok) {
        // Retry on 5xx only
        if (res.status >= 500 && attempt < retries) {
          const delay = retryDelayMs + Math.floor(Math.random() * 200);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        const text = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
      }
      return (await res.json()) as T;
    } catch (err: any) {
      lastErr = err;
      const isAbort = err?.name === 'AbortError';
      // Retry network/abort errors (often transient) up to retries
      if (attempt < retries && (isAbort || err?.message?.includes('Failed to fetch'))) {
        const delay = retryDelayMs + Math.floor(Math.random() * 200);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

