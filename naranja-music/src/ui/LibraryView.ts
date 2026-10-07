import Sortable from "sortablejs";
import type { Song } from "../models/Song";
import type { PlayerController, InsertPosition } from "../player/PlayerController";
import type { AuthUser } from "../services/AuthService";
import { StorageInfo } from "../services/StorageInfo";
import { clearChildren, el, formatTime, formatTotalDuration } from "./dom";
import { Icons } from "./icons";
import { ToastHost } from "./ToastHost";

/**
 * Main screen: now playing panel, draggable playlist and the player bar.
 *
 * Drag and drop:
 *  - Drag a row to reorder the playlist (SortableJS handles mouse + touch).
 *  - Drop audio files from your computer onto the list to add them exactly
 *    where you drop them (between two rows), like Spotify.
 */
export class LibraryView {
  private readonly toasts = new ToastHost();
  private readonly unsubscribers: Array<() => void> = [];
  private sortable: Sortable | null = null;
  private filter = "";
  private seeking = false;
  private busy = false;
  private lastVolume = 0.8;

  // Elements that change while playing
  private readonly list = el("ul", { className: "track-list", attrs: { "aria-label": "Playlist" } });
  private readonly emptyState = el("div", { className: "empty-state" });
  private readonly stats = el("span", { className: "library-stats" });
  private readonly storageNote = el("p", { className: "storage-note" });
  private readonly storageInfo = new StorageInfo();
  private readonly status = el("span", { className: "status-text", attrs: { "aria-live": "polite" } });
  private readonly nowPlaying = el("aside", { className: "now-playing" });
  private readonly fileInput = el("input", {
    attrs: { type: "file", multiple: "", accept: "audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac", hidden: "" },
  });
  private readonly positionMode = el("select", { className: "field small", attrs: { "aria-label": "Where to add songs" } });
  private readonly positionIndex = el("input", {
    className: "field small number",
    attrs: { type: "number", min: "1", value: "1", "aria-label": "Position number" },
  });

  private readonly playButton = el("button", { className: "round-btn primary", attrs: { "aria-label": "Play", title: "Play / pause (Space)" } });
  private readonly previousButton = el("button", { className: "icon-btn", html: Icons.previous, attrs: { "aria-label": "Previous song", title: "Previous song (Shift + Left)" } });
  private readonly nextButton = el("button", { className: "icon-btn", html: Icons.next, attrs: { "aria-label": "Next song", title: "Next song (Shift + Right)" } });
  private readonly repeatButton = el("button", { className: "icon-btn", attrs: { "aria-label": "Repeat" } });
  private readonly seekBar = el("input", { className: "range seek", attrs: { type: "range", min: "0", max: "1000", value: "0", step: "1", "aria-label": "Seek" } });
  private readonly currentTimeLabel = el("span", { className: "time", text: "0:00" });
  private readonly durationLabel = el("span", { className: "time", text: "0:00" });
  private readonly volumeBar = el("input", { className: "range volume", attrs: { type: "range", min: "0", max: "100", value: "80", "aria-label": "Volume" } });
  private readonly muteButton = el("button", { className: "icon-btn", attrs: { "aria-label": "Mute" } });
  private readonly barTitle = el("div", { className: "bar-title" });
  private readonly barArtist = el("div", { className: "bar-artist" });
  private readonly barCover = el("div", { className: "bar-cover" });

  private readonly keyHandler = (event: KeyboardEvent): void => this.onKey(event);

  constructor(
    private readonly user: AuthUser,
    private readonly controller: PlayerController,
    private readonly onSignOut: () => void,
  ) {}

  // ---- mounting ----------------------------------------------------------

  public mount(container: HTMLElement): void {
    clearChildren(container);
    container.append(this.buildShell(), this.toasts.element);

    this.sortable = Sortable.create(this.list, {
      animation: 160,
      ghostClass: "track-ghost",
      chosenClass: "track-chosen",
      dragClass: "track-drag",
      filter: ".track-remove, .play-cell",
      preventOnFilter: false,
      delay: 140,
      delayOnTouchOnly: true,
      onEnd: (event) => {
        if (event.oldIndex !== undefined && event.newIndex !== undefined && event.oldIndex !== event.newIndex) {
          this.controller.move(event.oldIndex, event.newIndex);
        }
      },
    });

    this.unsubscribers.push(
      this.controller.on("change", () => this.renderAll()),
      this.controller.on("time", (current, duration) => this.renderTime(current, duration)),
      this.controller.on("toast", (message, kind) => this.toasts.show(message, kind)),
      this.controller.on("progress", (done, total) => {
        this.status.textContent = this.busy ? `Importing ${Math.min(done + 1, total)} of ${total}...` : "";
      }),
    );
    document.addEventListener("keydown", this.keyHandler);
    this.renderAll();
    this.renderTime(this.controller.currentTime, this.controller.duration);
    void this.renderStorageNote();
  }

  public destroy(): void {
    document.removeEventListener("keydown", this.keyHandler);
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers.length = 0;
    this.sortable?.destroy();
    this.sortable = null;
  }

  // ---- layout ------------------------------------------------------------

  private buildShell(): HTMLElement {
    const topbar = el(
      "header",
      { className: "topbar" },
      el(
        "div",
        { className: "brand" },
        el("img", { className: "brand-logo", attrs: { src: "./logo.png", alt: "Naranja Music logo", width: "40", height: "40" } }),
        el("span", { className: "brand-name", text: "Naranja Music" }),
      ),
      el("span", { className: "spacer" }),
      el("span", { className: "user-chip", text: this.user.username }),
      el("button", {
        className: "btn ghost",
        html: `${Icons.signOut}<span>Sign out</span>`,
        attrs: { type: "button" },
        on: { click: () => this.onSignOut() },
      }),
    );

    this.fileInput.addEventListener("change", () => {
      const files = Array.from(this.fileInput.files ?? []);
      this.fileInput.value = "";
      void this.importFiles(files, this.readSelectedPosition());
    });

    for (const [value, label] of [
      ["end", "Add at the end"],
      ["start", "Add at the start"],
      ["index", "Add at position..."],
    ]) {
      this.positionMode.append(el("option", { text: label as string, attrs: { value: value as string } }));
    }
    this.positionIndex.hidden = true;
    this.positionMode.addEventListener("change", () => {
      this.positionIndex.hidden = this.positionMode.value !== "index";
    });

    const search = el("input", {
      className: "field search",
      attrs: { type: "search", placeholder: "Search your songs", "aria-label": "Search songs" },
      on: {
        input: (event: Event) => {
          this.filter = (event.target as HTMLInputElement).value;
          this.sortable?.option("disabled", this.filter.trim() !== "");
          this.renderList();
        },
      },
    });

    const toolbar = el(
      "div",
      { className: "toolbar" },
      el("button", {
        className: "btn primary",
        html: `${Icons.plus}<span>Add songs</span>`,
        attrs: { type: "button" },
        on: { click: () => this.fileInput.click() },
      }),
      this.positionMode,
      this.positionIndex,
      this.status,
      el("span", { className: "spacer" }),
      search,
    );

    const library = el(
      "section",
      { className: "library" },
      el("div", { className: "library-head" }, el("h1", { text: "Your playlist" }), this.stats),
      toolbar,
      el("div", { className: "list-wrap" }, this.list, this.emptyState),
      this.storageNote,
      this.fileInput,
    );
    this.installFileDrop(library);

    const content = el("main", { className: "content" }, this.nowPlaying, library);
    return el("div", { className: "shell" }, topbar, content, this.buildPlayerBar());
  }

  private buildPlayerBar(): HTMLElement {
    this.playButton.addEventListener("click", () => void this.controller.togglePlay());
    this.previousButton.addEventListener("click", () => void this.controller.previous());
    this.nextButton.addEventListener("click", () => void this.controller.next());
    this.repeatButton.addEventListener("click", () => this.controller.cycleRepeat());

    this.seekBar.addEventListener("input", () => {
      this.seeking = true;
      const target = (Number(this.seekBar.value) / 1000) * this.controller.duration;
      this.currentTimeLabel.textContent = formatTime(target);
      this.paintRange(this.seekBar);
    });
    this.seekBar.addEventListener("change", () => {
      this.controller.seek((Number(this.seekBar.value) / 1000) * this.controller.duration);
      this.seeking = false;
    });

    this.volumeBar.addEventListener("input", () => {
      this.controller.setVolume(Number(this.volumeBar.value) / 100);
    });
    this.muteButton.addEventListener("click", () => {
      if (this.controller.volume > 0) {
        this.lastVolume = this.controller.volume;
        this.controller.setVolume(0);
      } else {
        this.controller.setVolume(this.lastVolume || 0.8);
      }
    });

    return el(
      "footer",
      { className: "player-bar" },
      el("div", { className: "bar-song" }, this.barCover, el("div", { className: "bar-text" }, this.barTitle, this.barArtist)),
      el(
        "div",
        { className: "bar-center" },
        el("div", { className: "controls" }, this.previousButton, this.playButton, this.nextButton, this.repeatButton),
        el("div", { className: "seek-row" }, this.currentTimeLabel, this.seekBar, this.durationLabel),
      ),
      el("div", { className: "bar-volume" }, this.muteButton, this.volumeBar),
    );
  }

  // ---- rendering ---------------------------------------------------------

  private renderAll(): void {
    this.renderList();
    this.renderNowPlaying();
    this.renderBar();
  }

  private renderList(): void {
    const songs = this.controller.songs;
    const current = this.controller.currentSong;
    const playing = this.controller.isPlaying;
    clearChildren(this.list);

    let total = 0;
    songs.forEach((song, index) => {
      total += song.duration;
      if (!song.matches(this.filter)) {
        return;
      }
      this.list.append(this.buildRow(song, index, current?.id === song.id, playing));
    });

    this.stats.textContent =
      songs.length === 0 ? "" : `${songs.length} song${songs.length === 1 ? "" : "s"} - ${formatTotalDuration(total)}`;
    this.positionIndex.max = String(songs.length + 1);

    const visible = this.list.childElementCount;
    this.list.hidden = visible === 0;
    this.emptyState.hidden = visible !== 0;
    clearChildren(this.emptyState);
    if (songs.length === 0) {
      this.emptyState.append(
        el("div", { className: "empty-icon", html: Icons.upload }),
        el("h2", { text: "Drop your music here" }),
        el("p", { text: "Drag audio files from your computer, or use the Add songs button. Your songs stay saved on this device." }),
      );
    } else if (visible === 0) {
      this.emptyState.append(el("h2", { text: "No songs match your search" }));
    }
  }

  private buildRow(song: Song, index: number, isCurrent: boolean, isPlaying: boolean): HTMLElement {
    const cover = song.coverUrl
      ? el("img", { className: "track-cover", attrs: { src: song.coverUrl, alt: "", width: "44", height: "44", loading: "lazy" } })
      : el("div", { className: "track-cover placeholder", html: Icons.music.replace('width="48" height="48"', 'width="22" height="22"') });

    const indexCell = el(
      "div",
      { className: "play-cell" },
      el("span", { className: "track-number", text: String(index + 1) }),
      el("span", { className: "equalizer", html: "<i></i><i></i><i></i>" }),
      el("button", {
        className: "row-play",
        html: isCurrent && isPlaying ? Icons.pause : Icons.play,
        attrs: { type: "button", "aria-label": isCurrent && isPlaying ? `Pause ${song.title}` : `Play ${song.title}` },
        on: {
          click: () => {
            if (isCurrent) {
              void this.controller.togglePlay();
            } else {
              void this.controller.playSong(song.id);
            }
          },
        },
      }),
    );

    const classes = ["track"];
    if (isCurrent) {
      classes.push("current");
    }
    if (isCurrent && isPlaying) {
      classes.push("playing");
    }

    return el(
      "li",
      {
        className: classes.join(" "),
        dataset: { id: song.id, index: String(index) },
        on: { dblclick: () => void this.controller.playSong(song.id) },
      },
      indexCell,
      cover,
      el("div", { className: "track-meta" }, el("div", { className: "track-title", text: song.title }), el("div", { className: "track-artist", text: song.artist })),
      el("div", { className: "track-album", text: song.album }),
      el("div", { className: "track-duration", text: formatTime(song.duration) }),
      el("button", {
        className: "icon-btn track-remove",
        html: Icons.trash,
        attrs: { type: "button", "aria-label": `Remove ${song.title}`, title: "Remove from playlist" },
        on: { click: () => void this.controller.remove(song.id) },
      }),
    );
  }

  private renderNowPlaying(): void {
    const song = this.controller.currentSong;
    const upcoming = this.controller.playlist.peekNext();
    clearChildren(this.nowPlaying);

    const art = song?.coverUrl
      ? el("img", { className: "np-cover", attrs: { src: song.coverUrl, alt: `Cover of ${song.title}` } })
      : el("img", { className: "np-cover logo-art", attrs: { src: "./logo.png", alt: "Naranja Music" } });

    this.nowPlaying.append(
      el("div", { className: "np-label", text: "Now playing" }),
      art,
      el("h2", { className: "np-title", text: song ? song.title : "Nothing playing" }),
      el("p", { className: "np-artist", text: song ? song.artist : "Pick a song to start" }),
    );
    if (song && upcoming) {
      this.nowPlaying.append(el("p", { className: "np-next", text: `Up next: ${upcoming.title}` }));
    }
  }

  private renderBar(): void {
    const song = this.controller.currentSong;
    const playing = this.controller.isPlaying;

    this.playButton.innerHTML = playing ? Icons.pause : Icons.play;
    this.playButton.setAttribute("aria-label", playing ? "Pause" : "Play");

    clearChildren(this.barCover);
    this.barCover.append(
      song?.coverUrl
        ? el("img", { attrs: { src: song.coverUrl, alt: "" } })
        : el("img", { className: "logo-art", attrs: { src: "./logo.png", alt: "" } }),
    );
    this.barTitle.textContent = song ? song.title : "Naranja Music";
    this.barArtist.textContent = song ? song.artist : "Choose something to play";

    const repeat = this.controller.repeat;
    this.repeatButton.innerHTML = repeat === "one" ? Icons.repeatOne : Icons.repeat;
    this.repeatButton.classList.toggle("active", repeat !== "off");
    this.repeatButton.setAttribute("aria-label", `Repeat: ${repeat}`);
    this.repeatButton.title = repeat === "off" ? "Repeat: off" : repeat === "all" ? "Repeat: whole playlist" : "Repeat: this song";

    this.volumeBar.value = String(Math.round(this.controller.volume * 100));
    this.paintRange(this.volumeBar);
    this.muteButton.innerHTML = this.controller.volume === 0 ? Icons.muted : Icons.volume;

    const empty = this.controller.songs.length === 0;
    this.playButton.disabled = empty;
    this.previousButton.disabled = empty;
    this.nextButton.disabled = empty;
  }

  private renderTime(current: number, duration: number): void {
    if (!this.seeking) {
      this.seekBar.value = duration > 0 ? String(Math.round((current / duration) * 1000)) : "0";
      this.currentTimeLabel.textContent = formatTime(current);
      this.paintRange(this.seekBar);
    }
    this.durationLabel.textContent = formatTime(duration);
  }

  private paintRange(range: HTMLInputElement): void {
    const percent = (Number(range.value) / Number(range.max)) * 100;
    range.style.setProperty("--fill", `${percent}%`);
  }

  /** Tell the user where the songs live, so a changed address is easy to spot. */
  private async renderStorageNote(): Promise<void> {
    const info = await this.storageInfo.read();
    let text = `Songs are saved only in this browser, for the address ${info.origin}.`;
    if (info.persisted === false) {
      text += " The browser may still clear them automatically, so do not clear site data or use a private window.";
    }
    this.storageNote.textContent = text;
  }

  // ---- adding songs ------------------------------------------------------

  private readSelectedPosition(): InsertPosition | null {
    switch (this.positionMode.value) {
      case "start":
        return { mode: "start" };
      case "index": {
        const max = this.controller.songs.length + 1;
        const value = Number(this.positionIndex.value);
        if (!Number.isInteger(value) || value < 1 || value > max) {
          this.toasts.show(`Position must be a number between 1 and ${max}.`, "error");
          return null;
        }
        return { mode: "index", index: value - 1 };
      }
      default:
        return { mode: "end" };
    }
  }

  private async importFiles(files: File[], position: InsertPosition | null): Promise<void> {
    if (files.length === 0 || position === null || this.busy) {
      return;
    }
    this.busy = true;
    try {
      const result = await this.controller.addFiles(files, position);
      const parts: string[] = [];
      if (result.added > 0) {
        parts.push(`${result.added} song${result.added === 1 ? "" : "s"} added`);
      }
      if (result.duplicates > 0) {
        parts.push(`${result.duplicates} already in your playlist`);
      }
      if (result.unsupported > 0) {
        parts.push(`${result.unsupported} not audio`);
      }
      if (result.failed > 0) {
        parts.push(`${result.failed} failed`);
      }
      this.toasts.show(parts.join(", ") || "Nothing to add.", result.added > 0 ? "success" : "info");
    } finally {
      this.busy = false;
      this.status.textContent = "";
      void this.renderStorageNote();
    }
  }

  /** Drop audio files from the computer straight onto the list. */
  private installFileDrop(target: HTMLElement): void {
    const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const clearMarks = (): void => {
      target.classList.remove("drop-active");
      for (const row of Array.from(this.list.querySelectorAll(".drop-before, .drop-after"))) {
        row.classList.remove("drop-before", "drop-after");
      }
    };
    const locate = (event: DragEvent): { row: HTMLElement | null; after: boolean } => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(".track");
      if (row === null) {
        return { row: null, after: false };
      }
      const box = row.getBoundingClientRect();
      return { row, after: event.clientY > box.top + box.height / 2 };
    };

    target.addEventListener("dragover", (event) => {
      if (!hasFiles(event)) {
        return;
      }
      event.preventDefault();
      clearMarks();
      target.classList.add("drop-active");
      const { row, after } = locate(event);
      row?.classList.add(after ? "drop-after" : "drop-before");
    });
    target.addEventListener("dragleave", (event) => {
      if (!target.contains(event.relatedTarget as Node | null)) {
        clearMarks();
      }
    });
    target.addEventListener("drop", (event) => {
      if (!hasFiles(event)) {
        return;
      }
      event.preventDefault();
      const { row, after } = locate(event);
      clearMarks();
      const files = Array.from(event.dataTransfer?.files ?? []);
      let position: InsertPosition | null;
      if (row !== null && this.filter.trim() === "") {
        position = { mode: "index", index: Number(row.dataset.index) + (after ? 1 : 0) };
      } else {
        position = this.readSelectedPosition();
      }
      void this.importFiles(files, position);
    });

    // A file dropped outside the list must not make the browser open it.
    window.addEventListener("dragover", (event) => {
      if (hasFiles(event)) {
        event.preventDefault();
      }
    });
    window.addEventListener("drop", (event) => {
      if (hasFiles(event)) {
        event.preventDefault();
      }
    });
  }

  // ---- keyboard ----------------------------------------------------------

  private onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    if (target.matches("input[type='text'], input[type='search'], input[type='number'], textarea, select")) {
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      void this.controller.togglePlay();
    } else if (event.code === "ArrowRight") {
      event.preventDefault();
      if (event.shiftKey) {
        void this.controller.next();
      } else {
        this.controller.seekBy(5);
      }
    } else if (event.code === "ArrowLeft") {
      event.preventDefault();
      if (event.shiftKey) {
        void this.controller.previous();
      } else {
        this.controller.seekBy(-5);
      }
    }
  }
}
