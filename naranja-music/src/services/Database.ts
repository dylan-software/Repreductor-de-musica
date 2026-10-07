/**
 * Thin promise based wrapper around IndexedDB.
 *
 * Stores:
 *  - users: accounts (hashed passwords)
 *  - songs: song metadata, one record per uploaded file
 *  - blobs: the audio data itself (kept apart so listing songs stays light)
 *  - meta:  small key/value records (for example the playlist order)
 */
export type StoreName = "users" | "songs" | "blobs" | "meta";

export class Database {
  private connection: Promise<IDBDatabase> | null = null;

  constructor(private readonly name = "naranja-music-db") {}

  private open(): Promise<IDBDatabase> {
    if (this.connection === null) {
      this.connection = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.name, 1);

        request.onupgradeneeded = () => {
          const db = request.result;
          const users = db.createObjectStore("users", { keyPath: "id" });
          users.createIndex("usernameKey", "usernameKey", { unique: true });
          const songs = db.createObjectStore("songs", { keyPath: "id" });
          songs.createIndex("userId", "userId", { unique: false });
          db.createObjectStore("blobs", { keyPath: "id" });
          db.createObjectStore("meta", { keyPath: "key" });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          this.connection = null;
          reject(request.error ?? new Error("Could not open the database"));
        };
        request.onblocked = () => reject(new Error("The database is blocked by another tab"));
      });
    }
    return this.connection;
  }

  private async request<T>(
    storeName: StoreName,
    mode: IDBTransactionMode,
    make: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(storeName, mode);
      const request = make(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Transaction aborted"));
    });
  }

  public get<T>(storeName: StoreName, key: IDBValidKey): Promise<T | undefined> {
    return this.request<T | undefined>(storeName, "readonly", (store) => store.get(key));
  }

  public put<T>(storeName: StoreName, value: T): Promise<IDBValidKey> {
    return this.request<IDBValidKey>(storeName, "readwrite", (store) => store.put(value));
  }

  public getByIndex<T>(
    storeName: StoreName,
    indexName: string,
    key: IDBValidKey,
  ): Promise<T | undefined> {
    return this.request<T | undefined>(storeName, "readonly", (store) =>
      store.index(indexName).get(key),
    );
  }

  public getAllByIndex<T>(
    storeName: StoreName,
    indexName: string,
    key: IDBValidKey,
  ): Promise<T[]> {
    return this.request<T[]>(storeName, "readonly", (store) => store.index(indexName).getAll(key));
  }

  /** Run several writes in a single atomic transaction. */
  public async writeAtomically(
    storeNames: StoreName[],
    work: (transaction: IDBTransaction) => void,
  ): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeNames, "readwrite");
      work(transaction);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error("Transaction aborted"));
    });
  }
}
