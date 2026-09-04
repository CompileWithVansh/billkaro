import { api } from './api';
import type { Item } from './types';

const DB_NAME = 'billkaro_offline_db';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('items')) {
        db.createObjectStore('items', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('pending_bills')) {
        db.createObjectStore('pending_bills', { keyPath: 'tempId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCachedItems(items: Item[]): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('items', 'readwrite');
    const store = tx.objectStore('items');
    store.clear();
    for (const item of items) {
      store.put(item);
    }
  } catch (err) {
    console.warn('Failed to cache items offline:', err);
  }
}

export async function getCachedItems(): Promise<Item[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('items', 'readonly');
      const store = tx.objectStore('items');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function queueOfflineBill(billData: any): Promise<{ tempId: string }> {
  const tempId = `OFF-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
  try {
    const db = await openDB();
    const tx = db.transaction('pending_bills', 'readwrite');
    const store = tx.objectStore('pending_bills');
    store.put({ tempId, ...billData, createdAt: new Date().toISOString() });
  } catch (err) {
    console.error('Failed to queue bill offline:', err);
  }
  return { tempId };
}

export async function getPendingOfflineBills(): Promise<any[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('pending_bills', 'readonly');
      const store = tx.objectStore('pending_bills');
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function clearOfflineBill(tempId: string): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction('pending_bills', 'readwrite');
    const store = tx.objectStore('pending_bills');
    store.delete(tempId);
  } catch (err) {
    console.error('Failed to delete pending offline bill:', err);
  }
}

export async function syncPendingBills(): Promise<number> {
  if (!navigator.onLine) return 0;
  const pending = await getPendingOfflineBills();
  if (!pending || pending.length === 0) return 0;

  let syncedCount = 0;
  for (const bill of pending) {
    try {
      const { tempId, createdAt, ...payload } = bill;
      await api.post('/bills', payload);
      await clearOfflineBill(tempId);
      syncedCount++;
    } catch (err) {
      console.error('Failed to sync offline bill:', err);
    }
  }
  return syncedCount;
}
