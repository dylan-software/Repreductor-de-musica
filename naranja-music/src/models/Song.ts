/** What is stored in IndexedDB for each song (audio data lives in a separate store). */
export interface SongRecord {
  id: string;
  userId: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  fileName: string;
  mimeType: string;
  size: number;
  fingerprint: string;
  cover: Blob | null;
  addedAt: number;
}

/** A song as the playlist and the UI see it. */
export class Song {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly artist: string,
    public readonly album: string,
    public readonly duration: number,
    public readonly fileName: string,
    public readonly fingerprint: string,
    public readonly coverUrl: string | null,
  ) {}

  public static fromRecord(record: SongRecord): Song {
    const coverUrl = record.cover ? URL.createObjectURL(record.cover) : null;
    return new Song(
      record.id,
      record.title,
      record.artist,
      record.album,
      record.duration,
      record.fileName,
      record.fingerprint,
      coverUrl,
    );
  }

  /** Release the object URL created for the cover art. */
  public dispose(): void {
    if (this.coverUrl) {
      URL.revokeObjectURL(this.coverUrl);
    }
  }

  public matches(query: string): boolean {
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return true;
    }
    return (
      this.title.toLowerCase().includes(needle) ||
      this.artist.toLowerCase().includes(needle) ||
      this.album.toLowerCase().includes(needle)
    );
  }
}
