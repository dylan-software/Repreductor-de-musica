/**
 * Doubly linked list used as the backbone of the playlist.
 *
 * Every node keeps TWO pointers: `prev` and `next`. The list keeps `head`,
 * `tail` and `length`. Because songs are linked in order, "the song after
 * song 2" is always `node.next`, so playback follows the playlist order.
 */
export class ListNode<T> {
  public prev: ListNode<T> | null = null;
  public next: ListNode<T> | null = null;

  constructor(public value: T) {}
}

export class DoublyLinkedList<T> implements Iterable<T> {
  public head: ListNode<T> | null = null;
  public tail: ListNode<T> | null = null;
  public length = 0;

  // ---- insertion ---------------------------------------------------------

  /** Insert at the beginning. */
  public prepend(value: T): ListNode<T> {
    return this.attachAtStart(new ListNode(value));
  }

  /** Insert at the end. */
  public append(value: T): ListNode<T> {
    return this.attachAtEnd(new ListNode(value));
  }

  /** Insert specifying the index (0-based): start, middle or end. */
  public insert(index: number, value: T): ListNode<T> {
    return this.insertNode(index, new ListNode(value));
  }

  // ---- access ------------------------------------------------------------

  /** Return the node at an index, walking from the closest end. */
  public traverseToIndex(index: number): ListNode<T> {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) {
      throw new RangeError(`Index ${index} is out of range`);
    }

    let node: ListNode<T>;
    if (index <= this.length / 2) {
      node = this.head as ListNode<T>;
      for (let step = 0; step < index; step++) {
        node = node.next as ListNode<T>;
      }
    } else {
      node = this.tail as ListNode<T>;
      for (let step = this.length - 1; step > index; step--) {
        node = node.prev as ListNode<T>;
      }
    }
    return node;
  }

  public getAt(index: number): T {
    return this.traverseToIndex(index).value;
  }

  public findNode(predicate: (value: T) => boolean): ListNode<T> | null {
    let node = this.head;
    while (node !== null) {
      if (predicate(node.value)) {
        return node;
      }
      node = node.next;
    }
    return null;
  }

  public indexOf(predicate: (value: T) => boolean): number {
    let node = this.head;
    let index = 0;
    while (node !== null) {
      if (predicate(node.value)) {
        return index;
      }
      node = node.next;
      index += 1;
    }
    return -1;
  }

  // ---- removal -----------------------------------------------------------

  /** Remove a node that belongs to this list and return its value. */
  public removeNode(node: ListNode<T>): T {
    this.detach(node);
    node.prev = null;
    node.next = null;
    return node.value;
  }

  public removeAt(index: number): T {
    return this.removeNode(this.traverseToIndex(index));
  }

  public clear(): void {
    this.head = null;
    this.tail = null;
    this.length = 0;
  }

  // ---- reordering --------------------------------------------------------

  /**
   * Move the item at `from` so it ends up at index `to`.
   * The very same node object is relinked, so external references to the
   * node (for example "the song that is playing") stay valid.
   */
  public move(from: number, to: number): boolean {
    const valid = (index: number): boolean =>
      Number.isInteger(index) && index >= 0 && index < this.length;
    if (!valid(from) || !valid(to)) {
      return false;
    }
    if (from === to) {
      return true;
    }
    const node = this.traverseToIndex(from);
    this.detach(node);
    this.insertNode(to, node);
    return true;
  }

  // ---- iteration ---------------------------------------------------------

  public toArray(): T[] {
    const result: T[] = new Array<T>(this.length);
    let node = this.head;
    let index = 0;
    while (node !== null) {
      result[index] = node.value;
      node = node.next;
      index += 1;
    }
    return result;
  }

  public *[Symbol.iterator](): Iterator<T> {
    let node = this.head;
    while (node !== null) {
      yield node.value;
      node = node.next;
    }
  }

  // ---- internals ---------------------------------------------------------

  private insertNode(index: number, node: ListNode<T>): ListNode<T> {
    if (index <= 0) {
      return this.attachAtStart(node);
    }
    if (index >= this.length) {
      return this.attachAtEnd(node);
    }
    const leader = this.traverseToIndex(index - 1);
    const follower = leader.next as ListNode<T>;
    leader.next = node;
    node.prev = leader;
    node.next = follower;
    follower.prev = node;
    this.length += 1;
    return node;
  }

  private attachAtStart(node: ListNode<T>): ListNode<T> {
    node.prev = null;
    node.next = this.head;
    if (this.head === null) {
      this.tail = node;
    } else {
      this.head.prev = node;
    }
    this.head = node;
    this.length += 1;
    return node;
  }

  private attachAtEnd(node: ListNode<T>): ListNode<T> {
    node.next = null;
    node.prev = this.tail;
    if (this.tail === null) {
      this.head = node;
    } else {
      this.tail.next = node;
    }
    this.tail = node;
    this.length += 1;
    return node;
  }

  /** Unlink the node from its neighbours (its own pointers are left as is). */
  private detach(node: ListNode<T>): void {
    if (node.prev === null) {
      this.head = node.next;
    } else {
      node.prev.next = node.next;
    }
    if (node.next === null) {
      this.tail = node.prev;
    } else {
      node.next.prev = node.prev;
    }
    this.length -= 1;
  }
}
