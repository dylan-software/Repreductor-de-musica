import { Emitter } from "../core/Emitter";
import { SingleInstanceGuard } from "./SingleInstanceGuard";

interface EngineEvents {
  ended: [];
  time: [currentTime: number, duration: number];
  state: [isPlaying: boolean];
  error: [message: string];
}

/**
 * Wraps ONE HTMLAudioElement. Because the whole app shares a single audio
 * element, two songs can never play at the same time: loading a new song
 * always pauses and replaces the previous one.
 */
export class AudioEngine extends Emitter<EngineEvents> {
  private readonly audio = new Audio();
  private objectUrl: string | null = null;
  private readonly guard: SingleInstanceGuard;

  constructor() {
    super();
    this.audio.preload = "auto";
    this.guard = new SingleInstanceGuard(() => this.pause());

    this.audio.addEventListener("ended", () => this.emit("ended"));
    this.audio.addEventListener("timeupdate", () => this.emitTime());
    this.audio.addEventListener("durationchange", () => this.emitTime());
    this.audio.addEventListener("play", () => this.emit("state", true));
    this.audio.addEventListener("pause", () => this.emit("state", false));
    this.audio.addEventListener("error", () => {
      if (this.objectUrl !== null) {
        this.emit("error", "This file could not be played. The format may not be supported.");
      }
    });
  }

  public get currentTime(): number {
    return this.audio.currentTime;
  }

  public get duration(): number {
    return Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
  }

  public get isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended;
  }

  public get volume(): number {
    return this.audio.volume;
  }

  /** Replace the current audio with a new blob (the previous one is stopped). */
  public load(blob: Blob): void {
    this.audio.pause();
    this.releaseUrl();
    this.objectUrl = URL.createObjectURL(blob);
    this.audio.src = this.objectUrl;
    this.audio.load();
    this.emitTime();
  }

  /** Remove the loaded audio entirely. */
  public unload(): void {
    this.audio.pause();
    this.releaseUrl();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.emitTime();
  }

  public async play(): Promise<void> {
    if (this.objectUrl === null) {
      return;
    }
    this.guard.announce();
    try {
      await this.audio.play();
    } catch (error) {
      // AbortError happens when a new song is loaded while play() is pending.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        this.emit("error", "The browser blocked playback. Press play again.");
      }
    }
  }

  public pause(): void {
    this.audio.pause();
  }

  public seek(seconds: number): void {
    if (this.objectUrl === null) {
      return;
    }
    const limit = this.duration > 0 ? this.duration : seconds;
    this.audio.currentTime = Math.max(0, Math.min(seconds, limit));
    this.emitTime();
  }

  public setVolume(value: number): void {
    this.audio.volume = Math.max(0, Math.min(1, value));
  }

  public dispose(): void {
    this.unload();
    this.guard.close();
  }

  private releaseUrl(): void {
    if (this.objectUrl !== null) {
      const url = this.objectUrl;
      this.objectUrl = null;
      URL.revokeObjectURL(url);
    }
  }

  private emitTime(): void {
    this.emit("time", this.audio.currentTime, this.duration);
  }
}
