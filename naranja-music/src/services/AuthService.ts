import type { Database } from "./Database";

export interface AuthUser {
  id: string;
  username: string;
}

/**
 * Authentication contract. The app only depends on this interface, so the
 * local implementation below can be swapped for a cloud provider
 * (Firebase Auth, Supabase, Auth0, ...) without touching the UI.
 */
export interface AuthService {
  register(username: string, password: string): Promise<AuthUser>;
  login(username: string, password: string): Promise<AuthUser>;
  restoreSession(): Promise<AuthUser | null>;
  logout(): void;
}

export class AuthError extends Error {}

interface UserRecord {
  id: string;
  username: string;
  usernameKey: string;
  salt: string;
  hash: string;
  iterations: number;
  createdAt: number;
}

const SESSION_KEY = "naranja-music:session";
const PBKDF2_ITERATIONS = 150_000;

/**
 * Accounts stored in this browser's IndexedDB. Passwords are never saved:
 * only a salted PBKDF2-SHA256 hash is kept.
 */
export class LocalAuthService implements AuthService {
  constructor(private readonly database: Database) {}

  public async register(username: string, password: string): Promise<AuthUser> {
    const cleanName = username.trim();
    if (cleanName.length < 3 || cleanName.length > 24) {
      throw new AuthError("Username must have between 3 and 24 characters.");
    }
    if (!/^[\w.-]+$/.test(cleanName)) {
      throw new AuthError("Username can only contain letters, numbers, dots, dashes and underscores.");
    }
    if (password.length < 6) {
      throw new AuthError("Password must have at least 6 characters.");
    }

    const usernameKey = cleanName.toLowerCase();
    const existing = await this.database.getByIndex<UserRecord>("users", "usernameKey", usernameKey);
    if (existing) {
      throw new AuthError("That username is already taken.");
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await this.derive(password, salt, PBKDF2_ITERATIONS);
    const record: UserRecord = {
      id: crypto.randomUUID(),
      username: cleanName,
      usernameKey,
      salt: this.toBase64(salt),
      hash: this.toBase64(hash),
      iterations: PBKDF2_ITERATIONS,
      createdAt: Date.now(),
    };
    await this.database.put("users", record);
    return this.startSession(record);
  }

  public async login(username: string, password: string): Promise<AuthUser> {
    const record = await this.database.getByIndex<UserRecord>(
      "users",
      "usernameKey",
      username.trim().toLowerCase(),
    );
    if (!record) {
      throw new AuthError("Wrong username or password.");
    }
    const candidate = await this.derive(
      password,
      this.fromBase64(record.salt),
      record.iterations,
    );
    if (!this.sameBytes(candidate, this.fromBase64(record.hash))) {
      throw new AuthError("Wrong username or password.");
    }
    return this.startSession(record);
  }

  public async restoreSession(): Promise<AuthUser | null> {
    let userId: string | null = null;
    try {
      userId = localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
    if (userId === null) {
      return null;
    }
    const record = await this.database.get<UserRecord>("users", userId);
    return record ? { id: record.id, username: record.username } : null;
  }

  public logout(): void {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // Storage may be unavailable (private mode); nothing to clear then.
    }
  }

  private startSession(record: UserRecord): AuthUser {
    try {
      localStorage.setItem(SESSION_KEY, record.id);
    } catch {
      // The session simply will not survive a reload.
    }
    return { id: record.id, username: record.username };
  }

  private async derive(
    password: string,
    salt: Uint8Array<ArrayBuffer>,
    iterations: number,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
      material,
      256,
    );
    return new Uint8Array(bits);
  }

  private sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
      return false;
    }
    let difference = 0;
    for (let index = 0; index < a.length; index++) {
      difference |= (a[index] as number) ^ (b[index] as number);
    }
    return difference === 0;
  }

  private toBase64(bytes: Uint8Array): string {
    let text = "";
    for (const byte of bytes) {
      text += String.fromCharCode(byte);
    }
    return btoa(text);
  }

  private fromBase64(text: string): Uint8Array<ArrayBuffer> {
    const raw = atob(text);
    const bytes = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index++) {
      bytes[index] = raw.charCodeAt(index);
    }
    return bytes;
  }
}
