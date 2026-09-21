export function createLazyClientLoader<T>(load: () => Promise<T>): () => Promise<T> {
  let cachedPromise: Promise<T> | null = null;

  return () => {
    if (cachedPromise) return cachedPromise;

    cachedPromise = load().catch((error: unknown) => {
      cachedPromise = null;
      throw error;
    });
    return cachedPromise;
  };
}
