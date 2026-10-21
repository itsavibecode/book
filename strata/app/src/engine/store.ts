// IndexedDB persistence. Database 'strata' v1:
//   documents : key = doc id        -> { meta: DocumentMeta, json: SerializedDocumentJson }
//   blobs     : key = `${docId}/${blobKey}` -> Blob (PNG)
//   settings  : key = string        -> any structured-cloneable value
import type { DocumentLike, SerializedDocumentJson, StoreLike } from './contract';
import type { DocId, DocumentMeta } from './types';
import { deserializeParts, serializeParts, type SerializeSkip } from './serialize';
import { pngBlob } from './png';
import { thumbnailDataUrl } from './thumb';

const DB_NAME = 'strata';
const DB_VERSION = 1;

interface DocRecord { meta: DocumentMeta; json: SerializedDocumentJson }

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB, so work cannot be saved on this device'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['documents', 'blobs', 'settings']) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading the schema: close so it can proceed, reopen lazily next time.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error ?? new Error('Could not open the local database')); };
    req.onblocked = () => { /* waits for the other tab to close its connection */ };
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('The local database rejected the write'));
    tx.onabort = () => reject(tx.error ?? new Error('The local database write was cancelled'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const blobRange = (id: DocId) => IDBKeyRange.bound(`${id}/`, `${id}/￿`);

export interface SaveOptions {
  /** Blob keys that are already stored and unchanged; they are neither re-encoded nor deleted. */
  skip?: SerializeSkip;
  /** Thumbnail to store; undefined builds a fresh one. */
  thumbnail?: string;
  buildThumbnail?: boolean;
}

/** Serialises synchronously before the first await, so the saved state is one consistent instant. */
export async function saveDocumentWith(doc: DocumentLike, opts: SaveOptions = {}): Promise<DocumentMeta> {
  const parts = serializeParts(doc, opts.skip);
  const keep = new Set(parts.keys);
  const thumbnail = opts.buildThumbnail === false ? opts.thumbnail : (await thumbnailDataUrl(doc)) ?? opts.thumbnail;
  const meta: DocumentMeta = {
    id: doc.id, name: doc.name, width: doc.width, height: doc.height,
    createdAt: doc.createdAt, updatedAt: parts.json.updatedAt, thumbnail,
  };
  const db = await openDb();
  const tx = db.transaction(['documents', 'blobs'], 'readwrite');
  const blobs = tx.objectStore('blobs');
  const prefix = `${doc.id}/`;
  const keysReq = blobs.getAllKeys(blobRange(doc.id));
  keysReq.onsuccess = () => {
    for (const k of keysReq.result) {
      const short = String(k).slice(prefix.length);
      if (!keep.has(short)) blobs.delete(k);
    }
  };
  for (const [k, bytes] of Object.entries(parts.files)) blobs.put(pngBlob(bytes), prefix + k);
  const rec: DocRecord = { meta, json: parts.json };
  tx.objectStore('documents').put(rec, doc.id);
  await done(tx);
  return meta;
}

export async function readMeta(id: DocId): Promise<DocumentMeta | null> {
  const db = await openDb();
  const tx = db.transaction('documents', 'readonly');
  const rec = await request(tx.objectStore('documents').get(id) as IDBRequest<DocRecord | undefined>);
  return rec ? rec.meta : null;
}

export const store: StoreLike = {
  async listDocuments() {
    const db = await openDb();
    const tx = db.transaction('documents', 'readonly');
    const recs = await request(tx.objectStore('documents').getAll() as IDBRequest<DocRecord[]>);
    return recs.map((r) => r.meta).sort((a, b) => b.updatedAt - a.updatedAt);
  },

  async loadDocument(id) {
    const db = await openDb();
    const tx = db.transaction(['documents', 'blobs'], 'readonly');
    const recReq = tx.objectStore('documents').get(id) as IDBRequest<DocRecord | undefined>;
    const keysReq = tx.objectStore('blobs').getAllKeys(blobRange(id));
    const valsReq = tx.objectStore('blobs').getAll(blobRange(id)) as IDBRequest<Blob[]>;
    await done(tx);
    const rec = recReq.result;
    if (!rec) return null;
    const src: Record<string, Blob> = {};
    const prefix = `${id}/`;
    keysReq.result.forEach((k, i) => { src[String(k).slice(prefix.length)] = valsReq.result[i]; });
    return deserializeParts(rec.json, src);
  },

  async saveDocument(doc) {
    await saveDocumentWith(doc);
  },

  async deleteDocument(id) {
    const db = await openDb();
    const tx = db.transaction(['documents', 'blobs'], 'readwrite');
    tx.objectStore('documents').delete(id);
    tx.objectStore('blobs').delete(blobRange(id));
    await done(tx);
  },

  async getOpenDocuments() {
    const v = await store.getSetting<DocId[]>('openDocuments', []);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  },

  async setOpenDocuments(ids) {
    await store.setSetting('openDocuments', [...ids]);
  },

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const db = await openDb();
    const tx = db.transaction('settings', 'readonly');
    const v = await request(tx.objectStore('settings').get(key));
    return v === undefined ? fallback : (v as T);
  },

  async setSetting<T>(key: string, value: T): Promise<void> {
    const db = await openDb();
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(value, key);
    await done(tx);
  },
};
