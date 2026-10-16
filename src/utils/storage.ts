import { RecentDocItem } from '../types';

const STORE_KEY = 'recent_docs_v4';
const DB_NAME = 'boustro_db';
const STORE_NAME = 'files';

// IndexedDB instance wrapper
function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not available'));
    }
    const req = window.indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function fileOp<T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = callback(store);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function putFileBlob(key: string, blob: Blob): Promise<void> {
  try {
    await fileOp('readwrite', (store) => store.put(blob, key));
  } catch (err) {
    console.warn('Failed to save file to IndexedDB:', err);
  }
}

export async function getFileBlob(key: string): Promise<Blob | null> {
  try {
    const result = await fileOp<Blob | undefined>('readonly', (store) => store.get(key));
    return result || null;
  } catch (err) {
    console.warn('Failed to read file from IndexedDB:', err);
    return null;
  }
}

export async function deleteFileBlob(key: string): Promise<void> {
  try {
    await fileOp('readwrite', (store) => store.delete(key));
  } catch (err) {
    console.warn('Failed to delete file from IndexedDB:', err);
  }
}

// LocalStorage helpers for recent documents
export function getRecentDocs(): RecentDocItem[] {
  try {
    const data = localStorage.getItem(STORE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveRecentDoc(item: Omit<RecentDocItem, 'id'>): RecentDocItem[] {
  try {
    const current = getRecentDocs();
    const id = item.name + '_' + item.date;
    const filtered = current.filter((doc) => doc.name !== item.name);
    const updated: RecentDocItem[] = [{ ...item, id }, ...filtered].slice(0, 15);
    localStorage.setItem(STORE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function removeRecentDoc(name: string): RecentDocItem[] {
  try {
    const current = getRecentDocs();
    const updated = current.filter((doc) => doc.name !== name);
    localStorage.setItem(STORE_KEY, JSON.stringify(updated));
    deleteFileBlob(name).catch(() => {});
    return updated;
  } catch {
    return [];
  }
}

export function clearRecentDocs(): void {
  try {
    const current = getRecentDocs();
    current.forEach((doc) => deleteFileBlob(doc.name).catch(() => {}));
    localStorage.removeItem(STORE_KEY);
  } catch {
    // ignore
  }
}

export async function readBlobOrUriBuffer(asset: { file?: Blob; buffer?: ArrayBuffer; text?: string }): Promise<ArrayBuffer> {
  if (asset.buffer) return asset.buffer;
  if (asset.file) return await asset.file.arrayBuffer();
  if (asset.text) {
    const enc = new TextEncoder();
    return enc.encode(asset.text).buffer as ArrayBuffer;
  }
  throw new Error('No valid document buffer available.');
}
