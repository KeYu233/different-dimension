// 本地库：IndexedDB 存书架条目与全局设置
const DB_NAME = 'shuye-reader';
const DB_VER = 1;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) {
        const s = db.createObjectStore('books', { keyPath: 'id' });
        s.createIndex('lastReadAt', 'lastReadAt');
        s.createIndex('addedAt', 'addedAt');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function listBooks() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction('books', 'readonly');
    const r = t.objectStore('books').getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function getBook(id) {
  const db = await openDB();
  return req(db.transaction('books', 'readonly').objectStore('books').get(id));
}

export async function putBook(book) {
  const db = await openDB();
  await req(db.transaction('books', 'readwrite').objectStore('books').put(book));
  return book;
}

export async function patchBook(id, patch) {
  const book = await getBook(id);
  if (!book) return null;
  Object.assign(book, patch);
  await putBook(book);
  return book;
}

export async function deleteBook(id) {
  const db = await openDB();
  await req(db.transaction('books', 'readwrite').objectStore('books').delete(id));
}

export async function getSetting(key, fallback) {
  const db = await openDB();
  const row = await req(db.transaction('settings', 'readonly').objectStore('settings').get(key));
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  const db = await openDB();
  await req(db.transaction('settings', 'readwrite').objectStore('settings').put({ key, value }));
}

export async function storageEstimate() {
  try {
    const e = await navigator.storage.estimate();
    return { usage: e.usage || 0, quota: e.quota || 0 };
  } catch { return { usage: 0, quota: 0 }; }
}
