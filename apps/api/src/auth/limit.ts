export class QueueFullError extends Error {}

/** Runs at most `max` tasks at once; later ones wait their turn in arrival order. */
export function concurrencyLimit(max: number, maxWaiting: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active < max) active++;
    else {
      if (waiting.length >= maxWaiting)
        throw new QueueFullError("Password verification is busy. Try again shortly.");
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    try {
      return await task();
    } finally {
      // Hand the slot straight to the next waiter, or free it.
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}
