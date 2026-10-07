import { DoublyLinkedList, type ListNode } from "../structures/DoublyLinkedList";
import type { Song } from "../models/Song";

export interface RemovalResult {
  removed: Song;
  wasCurrent: boolean;
  /** Song that takes the place of the removed current song (if any). */
  fallback: Song | null;
}

/**
 * Ordered playlist built on a doubly linked list.
 * It remembers the node that is "current", so next / previous are just
 * `node.next` and `node.prev`: after song 2 always comes song 3.
 */
export class Playlist {
  private readonly list = new DoublyLinkedList<Song>();
  private currentNode: ListNode<Song> | null = null;

  public get length(): number {
    return this.list.length;
  }

  public get current(): Song | null {
    return this.currentNode ? this.currentNode.value : null;
  }

  public get currentIndex(): number {
    if (this.currentNode === null) {
      return -1;
    }
    return this.list.indexOf((song) => song === this.currentNode?.value);
  }

  public get hasNext(): boolean {
    return this.currentNode !== null && this.currentNode.next !== null;
  }

  public get hasPrevious(): boolean {
    return this.currentNode !== null && this.currentNode.prev !== null;
  }

  public peekNext(): Song | null {
    return this.currentNode?.next ? this.currentNode.next.value : null;
  }

  public toArray(): Song[] {
    return this.list.toArray();
  }

  public indexOfId(id: string): number {
    return this.list.indexOf((song) => song.id === id);
  }

  // ---- editing -----------------------------------------------------------

  /** Append many songs (used when loading from the database). */
  public load(songs: Song[]): void {
    for (const song of songs) {
      this.list.append(song);
    }
  }

  /**
   * Insert songs keeping their relative order, starting at `index` (0-based).
   * Index 0 means the start; an index >= length means the end.
   * Returns the index where the first song ended up.
   */
  public insertMany(index: number, songs: Song[]): number {
    const start = Math.max(0, Math.min(index, this.list.length));
    let offset = 0;
    for (const song of songs) {
      this.list.insert(start + offset, song);
      offset += 1;
    }
    return start;
  }

  public remove(id: string): RemovalResult | null {
    const node = this.list.findNode((song) => song.id === id);
    if (node === null) {
      return null;
    }
    const wasCurrent = node === this.currentNode;
    const fallbackNode = node.next ?? node.prev;
    const removed = this.list.removeNode(node);
    if (wasCurrent) {
      this.currentNode = fallbackNode;
    }
    return {
      removed,
      wasCurrent,
      fallback: wasCurrent && fallbackNode ? fallbackNode.value : null,
    };
  }

  public move(from: number, to: number): boolean {
    return this.list.move(from, to);
  }

  // ---- navigation --------------------------------------------------------

  public select(id: string): Song | null {
    const node = this.list.findNode((song) => song.id === id);
    if (node === null) {
      return null;
    }
    this.currentNode = node;
    return node.value;
  }

  public clearSelection(): void {
    this.currentNode = null;
  }

  /** Move to the next song in order. Returns null at the end of the list. */
  public advance(): Song | null {
    if (this.currentNode === null || this.currentNode.next === null) {
      return null;
    }
    this.currentNode = this.currentNode.next;
    return this.currentNode.value;
  }

  /** Move to the previous song in order. Returns null at the start. */
  public retreat(): Song | null {
    if (this.currentNode === null || this.currentNode.prev === null) {
      return null;
    }
    this.currentNode = this.currentNode.prev;
    return this.currentNode.value;
  }

  public goToFirst(): Song | null {
    this.currentNode = this.list.head;
    return this.current;
  }

  public goToLast(): Song | null {
    this.currentNode = this.list.tail;
    return this.current;
  }
}
