/**
 * Makes sure only ONE tab plays audio at a time.
 * When this tab starts playing it broadcasts a message; any other tab of the
 * app that receives it pauses itself.
 */
export class SingleInstanceGuard {
  private readonly tabId = crypto.randomUUID();
  private readonly channel: BroadcastChannel | null;

  constructor(onOtherTabPlays: () => void) {
    this.channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel("naranja-music-player");
    if (this.channel) {
      this.channel.onmessage = (event: MessageEvent<{ type: string; tabId: string }>) => {
        if (event.data.type === "playing" && event.data.tabId !== this.tabId) {
          onOtherTabPlays();
        }
      };
    }
  }

  /** Tell the other tabs that this one is about to play. */
  public announce(): void {
    this.channel?.postMessage({ type: "playing", tabId: this.tabId });
  }

  public close(): void {
    this.channel?.close();
  }
}
