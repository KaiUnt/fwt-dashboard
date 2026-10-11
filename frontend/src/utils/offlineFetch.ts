/** Try the online source first, then saved data, without hiding an online error. */
export async function fetchWithOfflineFallback<T>(
  fetchOnline: (() => Promise<T>) | null,
  fetchOffline: () => Promise<T | null>,
  noOfflineDataMessage: string,
): Promise<T> {
  let onlineError: unknown;

  if (fetchOnline) {
    try {
      return await fetchOnline();
    } catch (error) {
      onlineError = error;
    }
  }

  try {
    const offlineData = await fetchOffline();
    if (offlineData !== null) return offlineData;
  } catch (error) {
    throw onlineError ?? error;
  }

  throw onlineError ?? new Error(noOfflineDataMessage);
}
