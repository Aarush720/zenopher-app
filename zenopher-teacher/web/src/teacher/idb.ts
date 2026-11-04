// A very small IndexedDB key-value store. Every call fails soft: the teacher works without storage.
const DB = "zenopher-teacher";
const STORE = "kv";
let connection: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (connection) return connection;
  connection = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); connection = null; };
      db.onclose = () => { connection = null; };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
  });
  void connection.catch(() => { connection = null; });
  return connection;
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await open();
    return await new Promise<T | undefined>((res, rej) => {
      const r = db.transaction(STORE).objectStore(STORE).get(key);
      r.onsuccess = () => res(r.result as T | undefined);
      r.onerror = () => rej(r.error);
    });
  } catch { return undefined; }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* storage unavailable: carry on */ }
}
