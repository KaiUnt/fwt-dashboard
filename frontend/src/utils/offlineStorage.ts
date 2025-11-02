// IndexedDB wrapper for offline event storage
export interface OfflineEventData {
  id: string;
  type: 'single' | 'multi';
  timestamp: string;
  expiresAt: string;
  eventData: {
    events: Array<{
      id: string;
      name: string;
      date: string;
      location?: string;
    }>;
  };
  athletes: Array<{
    id: string;
    name: string;
    nationality?: string;
    dob?: string;
    image?: string;
    bib?: string;
    status: 'confirmed' | 'waitlisted';
    division?: string;
    eventSource?: string;
    eventName?: string;
  }>;
  seriesRankings?: unknown[];
  commentatorInfo?: {
    [athleteId: string]: Array<{
      id?: string;
      athlete_id: string;
      homebase?: string;
      team?: string;
      sponsors?: string;
      favorite_trick?: string;
      achievements?: string;
      injuries?: string;
      fun_facts?: string;
      notes?: string;
      social_media?: {
        instagram?: string;
        youtube?: string;
        website?: string;
      };
      custom_fields?: Record<string, string>;
      created_at?: string;
      updated_at?: string;
      created_by?: string;
      author_name?: string;
      is_own_data: boolean;
    }>;
  };
  totalAthletes: number;
  estimatedSize: number; // in MB
}

export interface OfflinePurchaseData {
  id: string;
  timestamp: string;
  eventIds: string[];
  eventNames?: string[];
  totalCost: number;
  userCredits: number;
  status: 'pending' | 'synced' | 'failed';
  retryCount: number;
  lastRetryAt?: string;
  errorMessage?: string;
}

export interface OfflineStorageStats {
  totalEvents: number;
  totalSize: number; // in MB
  oldestEvent: string;
  newestEvent: string;
}

class OfflineStorage {
  private dbName = 'fwt-offline-events';
  private version = 1;
  private storeName = 'events';
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create events store
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
    });
  }

  async saveEvent(eventData: OfflineEventData): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const request = store.put(eventData);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getEvent(eventId: string): Promise<OfflineEventData | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      
      const request = store.get(eventId);
      request.onsuccess = () => {
        const result = request.result;
        if (result && new Date(result.expiresAt) > new Date()) {
          resolve(result);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getAllEvents(): Promise<OfflineEventData[]> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      
      const request = store.getAll();
      request.onsuccess = () => {
        const now = new Date();
        const validEvents = request.result.filter(
          (event: OfflineEventData) => new Date(event.expiresAt) > now
        );
        resolve(validEvents);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deleteEvent(eventId: string): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const request = store.delete(eventId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async cleanupExpiredEvents(): Promise<number> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('expiresAt');
      
      const now = new Date().toISOString();
      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);
      
      let deletedCount = 0;
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  async getStorageStats(): Promise<OfflineStorageStats> {
    const events = await this.getAllEvents();
    
    if (events.length === 0) {
      return {
        totalEvents: 0,
        totalSize: 0,
        oldestEvent: '',
        newestEvent: ''
      };
    }

    const totalSize = events.reduce((sum, event) => sum + event.estimatedSize, 0);
    const timestamps = events.map(e => e.timestamp).sort();
    
    return {
      totalEvents: events.length,
      totalSize: Math.round(totalSize * 100) / 100,
      oldestEvent: timestamps[0],
      newestEvent: timestamps[timestamps.length - 1]
    };
  }

  async clearAllData(): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// Singleton instance
export const offlineStorage = new OfflineStorage();

class OfflinePurchaseStorage {
  private dbName = 'FWTOfflinePurchases';
  private version = 1;
  private storeName = 'purchases';

  private async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async savePurchase(purchase: OfflinePurchaseData): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    await store.put(purchase);
  }

  async getPendingPurchases(): Promise<OfflinePurchaseData[]> {
    const db = await this.openDB();
    const transaction = db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    const index = store.index('status');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll('pending');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async updatePurchaseStatus(id: string, status: 'synced' | 'failed', errorMessage?: string): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    
    return new Promise((resolve, reject) => {
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const purchase = getRequest.result;
        if (purchase) {
          purchase.status = status;
          purchase.lastRetryAt = new Date().toISOString();
          if (status === 'failed') {
            purchase.retryCount = (purchase.retryCount || 0) + 1;
            purchase.errorMessage = errorMessage;
          }
          const putRequest = store.put(purchase);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () => reject(putRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deletePurchase(id: string): Promise<void> {
    const db = await this.openDB();
    const transaction = db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    await store.delete(id);
  }

  async getAllPurchases(): Promise<OfflinePurchaseData[]> {
    const db = await this.openDB();
    const transaction = db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

export const offlinePurchaseStorage = new OfflinePurchaseStorage();

// Helper functions
export function createEventId(eventIds: string[]): string {
  return eventIds.length === 1 ? eventIds[0] : `multi_${eventIds.join('_')}`;
}

export function parseEventId(offlineEventId: string): string[] {
  if (offlineEventId.startsWith('multi_')) {
    return offlineEventId.replace('multi_', '').split('_');
  }
  return [offlineEventId];
}

export function calculateEstimatedSize(athletes: unknown[], seriesRankings: unknown[] = [], commentatorInfo: unknown = {}): number {
  // More accurate size estimation
  const athletesJson = JSON.stringify(athletes);
  const seriesJson = JSON.stringify(seriesRankings);
  const commentatorJson = JSON.stringify(commentatorInfo);
  
  const athletesKB = athletesJson.length / 1024;
  const seriesKB = seriesJson.length / 1024;
  const commentatorKB = commentatorJson.length / 1024;
  const totalKB = athletesKB + seriesKB + commentatorKB;
  

  
  return Math.round(totalKB / 1024 * 100) / 100; // Convert to MB
}

export function formatFileSize(sizeInMB: number): string {
  if (sizeInMB < 1) {
    return `${Math.round(sizeInMB * 1024)} KB`;
  }
  return `${Math.round(sizeInMB * 100) / 100} MB`;
}

export function getExpirationDate(hoursFromNow: number = 48): string {
  const now = new Date();
  const expiration = new Date(now.getTime() + hoursFromNow * 60 * 60 * 1000);
  return expiration.toISOString();
}

export function isDataStale(timestamp: string, staleHours: number = 24): boolean {
  const now = new Date();
  const dataTime = new Date(timestamp);
  const hoursDiff = (now.getTime() - dataTime.getTime()) / (1000 * 60 * 60);
  return hoursDiff > staleHours;
}

export function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
} 