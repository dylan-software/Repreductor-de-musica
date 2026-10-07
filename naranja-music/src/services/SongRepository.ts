import type { SongRecord } from "../models/Song";
import type { Database } from "./Database";

interface BlobEntry {
  id: string;
  blob: Blob;
}

interface OrderEntry {
  key: string;
  value: string[];
}

/** Saves and loads each user's songs from IndexedDB. */
export class SongRepository {
  constructor(private readonly database: Database) {}

  public listSongs(userId: string): Promise<SongRecord[]> {
    return this.database.getAllByIndex<SongRecord>("songs", "userId", userId);
  }

  public addSong(record: SongRecord, audio: Blob): Promise<void> {
    return this.database.writeAtomically(["songs", "blobs"], (transaction) => {
      transaction.objectStore("songs").put(record);
      transaction.objectStore("blobs").put({ id: record.id, blob: audio } satisfies BlobEntry);
    });
  }

  public async getAudio(songId: string): Promise<Blob | null> {
    const entry = await this.database.get<BlobEntry>("blobs", songId);
    return entry ? entry.blob : null;
  }

  public deleteSong(songId: string): Promise<void> {
    return this.database.writeAtomically(["songs", "blobs"], (transaction) => {
      transaction.objectStore("songs").delete(songId);
      transaction.objectStore("blobs").delete(songId);
    });
  }

  public async getOrder(userId: string): Promise<string[]> {
    const entry = await this.database.get<OrderEntry>("meta", `order:${userId}`);
    return entry ? entry.value : [];
  }

  public async saveOrder(userId: string, songIds: string[]): Promise<void> {
    await this.database.put<OrderEntry>("meta", { key: `order:${userId}`, value: songIds });
  }
}
