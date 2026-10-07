import { describe, expect, it } from "vitest";
import { DoublyLinkedList } from "./DoublyLinkedList";

function build(values: number[]): DoublyLinkedList<number> {
  const list = new DoublyLinkedList<number>();
  for (const value of values) {
    list.append(value);
  }
  return list;
}

/** Walk the list both ways and check the pointers are consistent. */
function expectConsistent(list: DoublyLinkedList<number>, expected: number[]): void {
  expect(list.toArray()).toEqual(expected);
  expect(list.length).toBe(expected.length);

  const backwards: number[] = [];
  let node = list.tail;
  while (node !== null) {
    backwards.push(node.value);
    node = node.prev;
  }
  expect(backwards).toEqual([...expected].reverse());

  if (expected.length === 0) {
    expect(list.head).toBeNull();
    expect(list.tail).toBeNull();
  } else {
    expect(list.head?.prev).toBeNull();
    expect(list.tail?.next).toBeNull();
  }
}

describe("DoublyLinkedList", () => {
  it("appends and prepends", () => {
    const list = new DoublyLinkedList<number>();
    list.append(2);
    list.append(3);
    list.prepend(1);
    expectConsistent(list, [1, 2, 3]);
  });

  it("inserts at every position of a 6 item list", () => {
    for (let position = 0; position <= 6; position++) {
      const list = build([10, 20, 30, 40, 50, 60]);
      list.insert(position, 99);
      const expected = [10, 20, 30, 40, 50, 60];
      expected.splice(position, 0, 99);
      expectConsistent(list, expected);
    }
  });

  it("clamps insert indexes outside the list", () => {
    const list = build([1, 2, 3]);
    list.insert(-5, 0);
    list.insert(100, 4);
    expectConsistent(list, [0, 1, 2, 3, 4]);
  });

  it("removes from start, middle and end", () => {
    const list = build([1, 2, 3, 4, 5]);
    expect(list.removeAt(0)).toBe(1);
    expect(list.removeAt(1)).toBe(3);
    expect(list.removeAt(2)).toBe(5);
    expectConsistent(list, [2, 4]);
    list.removeAt(0);
    list.removeAt(0);
    expectConsistent(list, []);
  });

  it("throws on invalid index", () => {
    const list = build([1, 2]);
    expect(() => list.traverseToIndex(2)).toThrow(RangeError);
    expect(() => list.traverseToIndex(-1)).toThrow(RangeError);
  });

  it("moves items to any position and keeps the same node object", () => {
    const base = [1, 2, 3, 4, 5];
    for (let from = 0; from < base.length; from++) {
      for (let to = 0; to < base.length; to++) {
        const list = build(base);
        const node = list.traverseToIndex(from);
        expect(list.move(from, to)).toBe(true);
        const expected = [...base];
        const [item] = expected.splice(from, 1);
        expected.splice(to, 0, item as number);
        expectConsistent(list, expected);
        expect(list.traverseToIndex(to)).toBe(node);
      }
    }
  });

  it("rejects invalid moves", () => {
    const list = build([1, 2, 3]);
    expect(list.move(0, 3)).toBe(false);
    expect(list.move(-1, 1)).toBe(false);
    expectConsistent(list, [1, 2, 3]);
  });
});
