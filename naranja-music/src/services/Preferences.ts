/** Small per-user settings (volume, repeat mode, last song) in localStorage. */
export class Preferences {
  constructor(private readonly userId: string) {}

  private key(name: string): string {
    return `naranja-music:${this.userId}:${name}`;
  }

  public get(name: string): string | null {
    try {
      return localStorage.getItem(this.key(name));
    } catch {
      return null;
    }
  }

  public set(name: string, value: string): void {
    try {
      localStorage.setItem(this.key(name), value);
    } catch {
      // Ignore: preferences are a convenience, not critical data.
    }
  }

  public remove(name: string): void {
    try {
      localStorage.removeItem(this.key(name));
    } catch {
      // Ignore.
    }
  }
}
