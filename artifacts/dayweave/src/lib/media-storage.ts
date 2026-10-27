export type SavedMedia = {
  key: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
};

const DATABASE_NAME = 'dayweave-media';
const DATABASE_VERSION = 1;
const STORE_NAME = 'assets';

let databasePromise: Promise<IDBDatabase> | undefined;

function openDatabase() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser does not support local media storage.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local media storage.'));
    request.onblocked = () => reject(new Error('Local media storage is busy in another tab.'));
  }).catch((error: unknown) => {
    databasePromise = undefined;
    throw error;
  });

  return databasePromise;
}

export async function listSavedMedia(): Promise<SavedMedia[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result as SavedMedia[]);
    request.onerror = () => reject(request.error ?? new Error('Could not read saved media.'));
  });
}

export async function saveMedia(key: string, file: File): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      key,
      blob: file,
      fileName: file.name,
      mimeType: file.type,
    } satisfies SavedMedia);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save this file.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Saving this file was cancelled.'));
  });
}

export async function deleteMedia(key: string): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not remove this file.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Removing this file was cancelled.'));
  });
}
