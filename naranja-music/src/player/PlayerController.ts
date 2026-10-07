import { Emitter } from "../core/Emitter";
import { Song, type SongRecord } from "../models/Song";
import type { AuthUser } from "../services/AuthService";
import type { MetadataReader } from "../services/MetadataReader";
import type { Preferences } from "../services/Preferences";
import type { SongRepository } from "../services/SongRepository";
import type { AudioEngine } from "./AudioEngine";
import { Playlist } from "./Playlist";

export type RepeatMode = "off" | "all" | "one";
export type ToastKind = "info" | "success" | "error";

/** Where new songs are inserted. `index` is 0-based. */
export type InsertPosition =
  | { mode: "start" }
  | { mode: "end" }
  | { mode: "index"; index: number };

export interface AddResult {
  added: number;
  duplicates: number;
  unsupported: number;
  failed: number;
}

interface ControllerEvents {
  change: [];
  time: [currentTime: number, duration: number];
  toast: [message: string, kind: ToastKind];
  progress: [done: number, total: number];
}

const AUDIO_EXTENSIONS = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|webm|mp4)$/i;
const REPEAT_ORDER: RepeatMode[] = ["off", "all", "one"];

/**
 * Coordinates the playlist, the audio engine and IndexedDB.
 * The UI only talks to this class.
 */
export class PlayerController extends Emitter<ControllerEvents> {
  public readonly playlist = new Playlist();

  private repeatMode: RepeatMode = "off";
  private loadToken = 0;
  private loadedSongId: string | null = null;
  private readonly fingerprints = new Set<string>();
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly user: AuthUser,
    private readonly repository: SongRepository,
    private readonly engine: AudioEngine,
    private readonly preferences: Preferences,
    private readonly metadataReader: MetadataReader,
  ) {
    super();
  }

  // ---- lifecycle ---------------------------------------------------------

  /** Load the user's saved songs from IndexedDB, in their saved order. */
  public async init(): Promise<void> {
    const [records, order] = await Promise.all([
      this.repository.listSongs(this.user.id),
      this.repository.getOrder(this.user.id),
    ]);

    const position = new Map<string, number>();
    order.forEach((id, index) => position.set(id, index));
    const unknown = Number.MAX_SAFE_INTEGER;
    const sorted = [...records].sort((a: SongRecord, b: SongRecord) => {
      const pa = position.get(a.id) ?? unknown;
      const pb = position.get(b.id) ?? unknown;
      return pa !== pb ? pa - pb : a.addedAt - b.addedAt;
    });

    const songs = sorted.map((record) => Song.fromRecord(record));
    this.playlist.load(songs);
    for (const song of songs) {
      this.fingerprints.add(song.fingerprint);
    }

    const savedRepeat = this.preferences.get("repeat");
    if (savedRepeat === "all" || savedRepeat === "one" || savedRepeat === "off") {
      this.repeatMode = savedRepeat;
    }
    const savedVolume = Number(this.preferences.get("volume"));
    this.engine.setVolume(this.preferences.get("volume") !== null && Number.isFinite(savedVolume) ? savedVolume : 0.8);

    this.unsubscribers.push(
      this.engine.on("ended", () => void this.handleEnded()),
      this.engine.on("time", (current, duration) => this.emit("time", current, duration)),
      this.engine.on("state", () => this.emit("change")),
      this.engine.on("error", (message) => this.emit("toast", message, "error")),
    );

    const lastId = this.preferences.get("lastSong");
    if (lastId !== null && this.playlist.select(lastId)) {
      await this.loadCurrent(false);
    }
    this.emit("change");
  }

  public dispose(): void {
    this.loadToken += 1;
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
    this.engine.unload();
    for (const song of this.playlist.toArray()) {
      song.dispose();
    }
  }

  // ---- state for the UI --------------------------------------------------

  public get songs(): Song[] {
    return this.playlist.toArray();
  }

  public get currentSong(): Song | null {
    return this.playlist.current;
  }

  public get isPlaying(): boolean {
    return this.engine.isPlaying;
  }

  public get repeat(): RepeatMode {
    return this.repeatMode;
  }

  public get volume(): number {
    return this.engine.volume;
  }

  public get currentTime(): number {
    return this.engine.currentTime;
  }

  public get duration(): number {
    return this.engine.duration;
  }

  // ---- adding songs ------------------------------------------------------

  /** Add audio files at the start, at the end or at any position. */
  public async addFiles(files: File[], position: InsertPosition): Promise<AddResult> {
    const result: AddResult = { added: 0, duplicates: 0, unsupported: 0, failed: 0 };
    const created: Song[] = [];

    for (let index = 0; index < files.length; index++) {
      const file = files[index] as File;
      this.emit("progress", index, files.length);

      if (!this.looksLikeAudio(file)) {
        result.unsupported += 1;
        continue;
      }
      const fingerprint = `${file.name}|${file.size}|${file.lastModified}`;
      if (this.fingerprints.has(fingerprint)) {
        result.duplicates += 1;
        continue;
      }

      try {
        const metadata = await this.metadataReader.read(file);
        const record: SongRecord = {
          id: crypto.randomUUID(),
          userId: this.user.id,
          title: metadata.title,
          artist: metadata.artist,
          album: metadata.album,
          duration: metadata.duration,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          fingerprint,
          cover: metadata.cover,
          addedAt: Date.now(),
        };
        await this.repository.addSong(record, file);
        this.fingerprints.add(fingerprint);
        created.push(Song.fromRecord(record));
        result.added += 1;
      } catch {
        result.failed += 1;
      }
    }
    this.emit("progress", files.length, files.length);

    if (created.length > 0) {
      const index = this.resolveIndex(position);
      this.playlist.insertMany(index, created);
      this.persistOrder();
      this.emit("change");
    }
    return result;
  }

  // ---- editing -----------------------------------------------------------

  public async remove(songId: string): Promise<void> {
    const wasPlaying = this.engine.isPlaying;
    const outcome = this.playlist.remove(songId);
    if (outcome === null) {
      return;
    }

    if (outcome.wasCurrent) {
      this.loadToken += 1;
      this.loadedSongId = null;
      this.engine.unload();
      if (outcome.fallback !== null) {
        await this.loadCurrent(wasPlaying);
      } else {
        this.preferences.remove("lastSong");
      }
    }

    this.fingerprints.delete(outcome.removed.fingerprint);
    outcome.removed.dispose();
    try {
      await this.repository.deleteSong(songId);
    } catch {
      this.emit("toast", "The song could not be removed from storage.", "error");
    }
    this.persistOrder();
    this.emit("change");
  }

  /** Move the song at `from` so it ends at index `to` (drag and drop). */
  public move(from: number, to: number): void {
    if (this.playlist.move(from, to)) {
      this.persistOrder();
      this.emit("change");
    }
  }

  // ---- playback ----------------------------------------------------------

  public async playSong(songId: string): Promise<void> {
    const song = this.playlist.select(songId);
    if (song === null) {
      return;
    }
    if (this.loadedSongId === song.id) {
      this.engine.seek(0);
      await this.engine.play();
    } else {
      await this.loadCurrent(true);
    }
    this.emit("change");
  }

  public async togglePlay(): Promise<void> {
    const current = this.playlist.current;
    if (current === null) {
      if (this.playlist.goToFirst() === null) {
        return;
      }
      await this.loadCurrent(true);
    } else if (this.loadedSongId !== current.id) {
      await this.loadCurrent(true);
    } else if (this.engine.isPlaying) {
      this.engine.pause();
    } else {
      await this.engine.play();
    }
    this.emit("change");
  }

  /** Go to the next song in playlist order. */
  public async next(): Promise<void> {
    if (this.playlist.current === null) {
      return;
    }
    const song = this.playlist.advance() ?? (this.repeatMode === "all" ? this.playlist.goToFirst() : null);
    if (song !== null) {
      await this.loadCurrent(true);
      this.emit("change");
    }
  }

  /** Restart the song if it already played a bit, otherwise go back one song. */
  public async previous(): Promise<void> {
    if (this.playlist.current === null) {
      return;
    }
    if (this.engine.currentTime > 3) {
      this.engine.seek(0);
      return;
    }
    const song = this.playlist.retreat() ?? (this.repeatMode === "all" ? this.playlist.goToLast() : null);
    if (song !== null) {
      await this.loadCurrent(true);
      this.emit("change");
    } else {
      this.engine.seek(0);
    }
  }

  public seek(seconds: number): void {
    this.engine.seek(seconds);
  }

  public seekBy(delta: number): void {
    this.engine.seek(this.engine.currentTime + delta);
  }

  public setVolume(value: number): void {
    this.engine.setVolume(value);
    this.preferences.set("volume", String(value));
    this.emit("change");
  }

  public cycleRepeat(): void {
    const next = REPEAT_ORDER[(REPEAT_ORDER.indexOf(this.repeatMode) + 1) % REPEAT_ORDER.length] as RepeatMode;
    this.repeatMode = next;
    this.preferences.set("repeat", next);
    this.emit("change");
  }

  // ---- internals ---------------------------------------------------------

  /**
   * Load the playlist's current song into the engine.
   * The token makes sure that, if the user clicks quickly through several
   * songs, only the last request wins and no older song starts to play.
   */
  private async loadCurrent(autoplay: boolean): Promise<void> {
    const song = this.playlist.current;
    if (song === null) {
      return;
    }
    const token = ++this.loadToken;
    this.engine.pause();

    let audio: Blob | null = null;
    try {
      audio = await this.repository.getAudio(song.id);
    } catch {
      audio = null;
    }
    if (token !== this.loadToken) {
      return;
    }
    if (audio === null) {
      this.emit("toast", `"${song.title}" could not be loaded from storage.`, "error");
      return;
    }

    this.engine.load(audio);
    this.loadedSongId = song.id;
    this.preferences.set("lastSong", song.id);
    this.emit("change");
    if (autoplay) {
      await this.engine.play();
    }
  }

  /** A song finished: go to the NEXT one in order (2 -> 3), never back to 1. */
  private async handleEnded(): Promise<void> {
    if (this.repeatMode === "one") {
      this.engine.seek(0);
      await this.engine.play();
      return;
    }
    const nextSong = this.playlist.advance() ?? (this.repeatMode === "all" ? this.playlist.goToFirst() : null);
    if (nextSong !== null) {
      await this.loadCurrent(true);
    } else {
      this.engine.seek(0);
    }
    this.emit("change");
  }

  private resolveIndex(position: InsertPosition): number {
    switch (position.mode) {
      case "start":
        return 0;
      case "end":
        return this.playlist.length;
      case "index":
        return Math.max(0, Math.min(position.index, this.playlist.length));
    }
  }

  private persistOrder(): void {
    const ids = this.playlist.toArray().map((song) => song.id);
    this.repository.saveOrder(this.user.id, ids).catch(() => {
      this.emit("toast", "The playlist order could not be saved.", "error");
    });
  }

  private looksLikeAudio(file: File): boolean {
    return file.type.startsWith("audio/") || AUDIO_EXTENSIONS.test(file.name);
  }
}
