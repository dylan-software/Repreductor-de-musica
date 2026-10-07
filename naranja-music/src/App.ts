import { AudioEngine } from "./player/AudioEngine";
import { MediaSessionAdapter } from "./player/MediaSessionAdapter";
import { PlayerController } from "./player/PlayerController";
import { type AuthService, type AuthUser, LocalAuthService } from "./services/AuthService";
import { Database } from "./services/Database";
import { MetadataReader } from "./services/MetadataReader";
import { Preferences } from "./services/Preferences";
import { SongRepository } from "./services/SongRepository";
import { clearChildren, el } from "./ui/dom";
import { LibraryView } from "./ui/LibraryView";
import { LoginView } from "./ui/LoginView";

/** Wires the services together and switches between the login and the player. */
export class App {
  private readonly database = new Database();
  private readonly auth: AuthService = new LocalAuthService(this.database);
  private readonly repository = new SongRepository(this.database);
  private readonly metadataReader = new MetadataReader();
  private readonly engine = new AudioEngine();

  private controller: PlayerController | null = null;
  private library: LibraryView | null = null;
  private mediaSession: MediaSessionAdapter | null = null;

  constructor(private readonly root: HTMLElement) {}

  public async start(): Promise<void> {
    this.showLoading();
    try {
      const user = await this.auth.restoreSession();
      if (user !== null) {
        await this.showLibrary(user);
      } else {
        this.showLogin();
      }
    } catch {
      this.showFatalError("Your browser could not open its local storage. Try a normal (non private) window.");
    }
  }

  private showLogin(): void {
    clearChildren(this.root);
    new LoginView(this.auth, (user) => void this.showLibrary(user)).mount(this.root);
  }

  private async showLibrary(user: AuthUser): Promise<void> {
    this.showLoading();
    try {
      const controller = new PlayerController(
        user,
        this.repository,
        this.engine,
        new Preferences(user.id),
        this.metadataReader,
      );
      await controller.init();
      this.controller = controller;
      this.mediaSession = new MediaSessionAdapter(controller);
      this.library = new LibraryView(user, controller, () => this.signOut());
      this.library.mount(this.root);
    } catch {
      this.auth.logout();
      this.showFatalError("Your saved songs could not be loaded.");
    }
  }

  private signOut(): void {
    this.library?.destroy();
    this.mediaSession?.dispose();
    this.controller?.dispose();
    this.library = null;
    this.mediaSession = null;
    this.controller = null;
    this.auth.logout();
    this.showLogin();
  }

  private showLoading(): void {
    clearChildren(this.root);
    this.root.append(
      el(
        "div",
        { className: "loading-screen" },
        el("img", { className: "login-logo spin", attrs: { src: "./logo.png", alt: "Loading Naranja Music", width: "96", height: "96" } }),
      ),
    );
  }

  private showFatalError(message: string): void {
    clearChildren(this.root);
    this.root.append(
      el(
        "main",
        { className: "login-screen" },
        el(
          "div",
          { className: "login-card" },
          el("h1", { className: "login-title", text: "Naranja Music" }),
          el("p", { className: "form-error", text: message }),
          el("button", {
            className: "btn primary wide",
            text: "Try again",
            on: { click: () => window.location.reload() },
          }),
        ),
      ),
    );
  }
}
