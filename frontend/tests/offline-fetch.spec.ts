import { test, expect } from '@playwright/test';
import { ApiError } from '../src/utils/api';
import { fetchWithOfflineFallback } from '../src/utils/offlineFetch';

const noOfflineDataMessage = 'No offline data available for this event';

test.describe('Event loading with an offline fallback', () => {
  test('returns online data without querying saved data', async () => {
    const event = { id: '123', athletes: [] };
    let offlineReads = 0;
    const result = await fetchWithOfflineFallback(
      async () => event,
      async () => { offlineReads++; return null; },
      noOfflineDataMessage,
    );

    expect(result).toBe(event);
    expect(offlineReads).toBe(0);
  });

  for (const status of [404, 500, 502]) {
    test(`preserves the original HTTP ${status} error when no event was saved`, async () => {
      const error = new ApiError('Event request failed', status, { detail: 'upstream failure' });
      await expect(fetchWithOfflineFallback(
        async () => { throw error; },
        async () => null,
        noOfflineDataMessage,
      )).rejects.toBe(error);
    });
  }

  test('uses saved event data when the online request fails', async () => {
    const savedEvent = { id: '123', athletes: [{ id: 'rider-1' }] };
    const result = await fetchWithOfflineFallback(
      async () => { throw new ApiError('Server Error', 500); },
      async () => savedEvent,
      noOfflineDataMessage,
    );

    expect(result).toBe(savedEvent);
  });

  test('preserves the online error when reading saved data also fails', async () => {
    const error = new ApiError('Server Error', 500);
    await expect(fetchWithOfflineFallback(
      async () => { throw error; },
      async () => { throw new Error('IndexedDB unavailable'); },
      noOfflineDataMessage,
    )).rejects.toBe(error);
  });

  test('loads a saved event without an online source in offline mode', async () => {
    const savedEvent = { id: '123' };
    await expect(fetchWithOfflineFallback(null, async () => savedEvent, noOfflineDataMessage)).resolves.toBe(savedEvent);
  });

  test('reports missing saved data when offline', async () => {
    await expect(fetchWithOfflineFallback(null, async () => null, noOfflineDataMessage)).rejects.toThrow(noOfflineDataMessage);
  });
});
