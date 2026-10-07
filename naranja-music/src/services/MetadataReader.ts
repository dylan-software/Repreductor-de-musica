import { parseBlob, selectCover } from "music-metadata";

export interface SongMetadata {
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: Blob | null;
}

/**
 * Reads title, artist, album, duration and cover art from the audio file.
 * Uses the `music-metadata` library (ID3, MP4, FLAC, OGG, WAV, ...), so the
 * tag parsing does not have to be written from scratch.
 */
export class MetadataReader {
  public async read(file: File): Promise<SongMetadata> {
    const result: SongMetadata = {
      title: this.titleFromFileName(file.name),
      artist: "Unknown artist",
      album: "",
      duration: 0,
      cover: null,
    };

    try {
      const metadata = await parseBlob(file, { duration: true });
      if (metadata.common.title) {
        result.title = metadata.common.title;
      }
      if (metadata.common.artist) {
        result.artist = metadata.common.artist;
      }
      if (metadata.common.album) {
        result.album = metadata.common.album;
      }
      if (metadata.format.duration && Number.isFinite(metadata.format.duration)) {
        result.duration = metadata.format.duration;
      }
      const picture = selectCover(metadata.common.picture);
      if (picture) {
        result.cover = new Blob([picture.data as BlobPart], { type: picture.format });
      }
    } catch {
      // Unreadable tags are fine: the file name is used as the title.
    }

    if (result.duration === 0) {
      result.duration = await this.probeDuration(file);
    }
    return result;
  }

  private titleFromFileName(fileName: string): string {
    const withoutExtension = fileName.replace(/\.[^./\\]+$/, "");
    const cleaned = withoutExtension.replace(/[_]+/g, " ").trim();
    return cleaned === "" ? fileName : cleaned;
  }

  /** Fallback: let the browser tell us the duration. */
  private probeDuration(file: File): Promise<number> {
    return new Promise<number>((resolve) => {
      const probe = new Audio();
      const url = URL.createObjectURL(file);
      const finish = (value: number): void => {
        URL.revokeObjectURL(url);
        probe.removeAttribute("src");
        resolve(Number.isFinite(value) ? value : 0);
      };
      probe.preload = "metadata";
      probe.onloadedmetadata = () => finish(probe.duration);
      probe.onerror = () => finish(0);
      probe.src = url;
    });
  }
}
