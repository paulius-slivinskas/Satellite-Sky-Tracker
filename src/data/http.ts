export class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}
export async function request<T>(
  url: string,
  options: {
    signal?: AbortSignal;
    type?: 'json' | 'text';
    attempts?: number;
    timeoutMs?: number;
    onResponse?: (response: Response) => void;
  } = {},
): Promise<T> {
  const { signal, type = 'json', attempts = 2, timeoutMs = 9000 } = options;
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      // Keep the deadline active until the response body is fully consumed.
      const timeout = AbortSignal.timeout(timeoutMs);
      const response = await fetch(url, {
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      options.onResponse?.(response);
      if (!response.ok) throw new HttpError(response.status);
      return (type === 'text' ? await response.text() : await response.json()) as T;
    } catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (
        attempt + 1 >= attempts ||
        (error instanceof HttpError && error.status < 500 && error.status !== 429)
      )
        throw error;
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          clearTimeout(timer);
          reject(signal?.reason);
        };
        const timer = setTimeout(
          () => {
            signal?.removeEventListener('abort', onAbort);
            resolve();
          },
          350 * (attempt + 1),
        );
        signal?.addEventListener('abort', onAbort, { once: true });
      });
    }
  }
}
