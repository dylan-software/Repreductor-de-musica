export interface StorageSummary {
  /** IndexedDB data belongs to this origin only (protocol + host + port). */
  origin: string;
  /** True when the browser promised not to evict the data automatically. */
  persisted: boolean | null;
  usedBytes: number | null;
}

/** Reports where and how the songs are being stored. */
export class StorageInfo {
  public async read(): Promise<StorageSummary> {
    let persisted: boolean | null = null;
    let usedBytes: number | null = null;

    try {
      if (navigator.storage?.persisted) {
        persisted = await navigator.storage.persisted();
        if (!persisted && navigator.storage.persist) {
          persisted = await navigator.storage.persist();
        }
      }
    } catch {
      persisted = null;
    }

    try {
      if (navigator.storage?.estimate) {
        usedBytes = (await navigator.storage.estimate()).usage ?? null;
      }
    } catch {
      usedBytes = null;
    }

    return { origin: window.location.origin, persisted, usedBytes };
  }
}
