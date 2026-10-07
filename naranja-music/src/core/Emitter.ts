type Listener<Args extends unknown[]> = (...args: Args) => void;

/** Tiny typed event emitter. */
export class Emitter<Events extends { [K in keyof Events]: unknown[] }> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never[]>>>();

  /** Subscribe to an event. Returns a function that unsubscribes. */
  public on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let bucket = this.listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(event, bucket);
    }
    bucket.add(listener as unknown as Listener<never[]>);
    return () => {
      bucket.delete(listener as unknown as Listener<never[]>);
    };
  }

  protected emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const bucket = this.listeners.get(event);
    if (!bucket) {
      return;
    }
    for (const listener of Array.from(bucket)) {
      (listener as unknown as Listener<Events[K]>)(...args);
    }
  }
}
