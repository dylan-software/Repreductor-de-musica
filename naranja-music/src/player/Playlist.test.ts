import { describe, expect, it } from "vitest";
import { Song } from "../models/Song";
import { Playlist } from "./Playlist";

function makeSong(id: string): Song {
  return new Song(id, `Title ${id}`, "Artist", "Album", 100, `${id}.mp3`, id, null);
}

function build(ids: string[]): Playlist {
  const playlist = new Playlist();
  playlist.load(ids.map(makeSong));
  return playlist;
}

function order(playlist: Playlist): string[] {
  return playlist.toArray().map((song) => song.id);
}

describe("Playlist", () => {
  it("plays in chronological order: after song 2 comes song 3", () => {
    const playlist = build(["1", "2", "3", "4"]);
    playlist.select("2");
    expect(playlist.advance()?.id).toBe("3");
    expect(playlist.advance()?.id).toBe("4");
    expect(playlist.advance()).toBeNull();
    expect(playlist.current?.id).toBe("4");
    expect(playlist.retreat()?.id).toBe("3");
  });

  it("inserts at the start, at the end and in the middle", () => {
    const playlist = build(["a", "b", "c", "d", "e", "f"]);
    playlist.insertMany(0, [makeSong("start")]);
    playlist.insertMany(99, [makeSong("end")]);
    playlist.insertMany(4, [makeSong("x"), makeSong("y")]);
    expect(order(playlist)).toEqual(["start", "a", "b", "c", "x", "y", "d", "e", "f", "end"]);
  });

  it("keeps the current song when other songs are inserted or moved", () => {
    const playlist = build(["1", "2", "3", "4"]);
    playlist.select("2");
    playlist.insertMany(0, [makeSong("new")]);
    expect(playlist.current?.id).toBe("2");
    expect(playlist.currentIndex).toBe(2);
    playlist.move(0, 4);
    expect(playlist.current?.id).toBe("2");
    expect(order(playlist)).toEqual(["1", "2", "3", "4", "new"]);
    expect(playlist.advance()?.id).toBe("3");
  });

  it("follows a manual reorder when advancing", () => {
    const playlist = build(["1", "2", "3"]);
    playlist.move(2, 0);
    playlist.goToFirst();
    expect(playlist.current?.id).toBe("3");
    expect(playlist.advance()?.id).toBe("1");
    expect(playlist.advance()?.id).toBe("2");
  });

  it("falls back to the next song when the current one is removed", () => {
    const playlist = build(["1", "2", "3"]);
    playlist.select("2");
    const result = playlist.remove("2");
    expect(result?.wasCurrent).toBe(true);
    expect(result?.fallback?.id).toBe("3");
    expect(playlist.current?.id).toBe("3");
  });

  it("falls back to the previous song when the last current song is removed", () => {
    const playlist = build(["1", "2", "3"]);
    playlist.select("3");
    const result = playlist.remove("3");
    expect(result?.fallback?.id).toBe("2");
    expect(playlist.current?.id).toBe("2");
  });

  it("empties cleanly", () => {
    const playlist = build(["1"]);
    playlist.select("1");
    const result = playlist.remove("1");
    expect(result?.fallback).toBeNull();
    expect(playlist.current).toBeNull();
    expect(playlist.length).toBe(0);
    expect(playlist.remove("nope")).toBeNull();
  });
});
