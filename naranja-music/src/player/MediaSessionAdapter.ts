import type { PlayerController } from "./PlayerController";

/**
 * Connects the player to the browser's Media Session API, so the keyboard
 * media keys, headphone buttons and the phone lock screen can control it.
 */
export class MediaSessionAdapter {
  private readonly unsubscribe: () => void;

  constructor(private readonly controller: PlayerController) {
    this.unsubscribe = controller.on("change", () => this.update());
    if (!("mediaSession" in navigator)) {
      return;
    }
    const session = navigator.mediaSession;
    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler]> = [
      ["play", () => void this.controller.togglePlay()],
      ["pause", () => void this.controller.togglePlay()],
      ["previoustrack", () => void this.controller.previous()],
      ["nexttrack", () => void this.controller.next()],
      ["seekto", (details) => {
        if (typeof details.seekTime === "number") {
          this.controller.seek(details.seekTime);
        }
      }],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Some browsers do not support every action.
      }
    }
  }

  public dispose(): void {
    this.unsubscribe();
    if (!("mediaSession" in navigator)) {
      return;
    }
    navigator.mediaSession.metadata = null;
    for (const action of ["play", "pause", "previoustrack", "nexttrack", "seekto"] as MediaSessionAction[]) {
      try {
        navigator.mediaSession.setActionHandler(action, null);
      } catch {
        // Ignore.
      }
    }
  }

  private update(): void {
    if (!("mediaSession" in navigator)) {
      return;
    }
    const song = this.controller.currentSong;
    if (song === null) {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "none";
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: song.title,
      artist: song.artist,
      album: song.album,
      artwork: song.coverUrl ? [{ src: song.coverUrl }] : [{ src: "./logo.png", sizes: "512x512", type: "image/png" }],
    });
    navigator.mediaSession.playbackState = this.controller.isPlaying ? "playing" : "paused";
  }
}
