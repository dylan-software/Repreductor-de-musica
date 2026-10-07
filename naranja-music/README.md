# Naranja Music

A web music player written in TypeScript. The playlist is a **doubly linked list**
(every node has `prev` and `next`), so playback follows the playlist order:
when song 2 ends, song 3 plays.

## Features

- Login / create account (passwords are stored as salted PBKDF2-SHA256 hashes).
- Add songs from the file explorer: at the **start**, at the **end** or at **any position**.
- **Drag and drop**: drag a row to reorder, or drop audio files from your computer
  between two rows to insert them exactly there.
- Remove songs, **next / previous song**, seek bar, volume, repeat (off / all / one).
- Songs are saved in the browser's **IndexedDB**, per user. On the next visit they load
  automatically, nothing has to be uploaded again. Only the songs the user picked are
  stored; the web app itself is never downloaded or installed.
- Only one song can play at a time (single audio element, request tokens against quick
  clicks, and a `BroadcastChannel` that pauses other open tabs).
- Keyboard: `Space` play/pause, `Left/Right` seek 5 s, `Shift+Left/Right` previous/next.
- Media keys and lock screen controls through the Media Session API.

## Libraries used (so these are not written from scratch)

| Need | Library / API |
| --- | --- |
| Title, artist, album, duration, cover art from audio files | `music-metadata` |
| Smooth drag-and-drop reordering (mouse + touch) | `SortableJS` |
| Password hashing | Web Crypto API (PBKDF2) |
| Local persistence | IndexedDB |
| Media keys / lock screen | Media Session API |
| One playing tab at a time | BroadcastChannel API |

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # type check + production build into dist/
npm run preview    # serve the production build
```

## Deploy

It is a static site: build with `npm run build` and publish the `dist/` folder.
**It must be served over HTTPS** (all the hosts below do this); the Web Crypto API used by
the login only works on HTTPS or `localhost`.

- **Vercel**: import the repository. `vercel.json` is already configured.
- **Netlify**: import the repository. `netlify.toml` is already configured.
- **Cloudflare Pages**: build command `npm run build`, output directory `dist`.
- **GitHub Pages**: push to `main`; `.github/workflows/deploy.yml` builds and publishes.
  In the repository go to Settings -> Pages and set the source to "GitHub Actions".

The build uses a relative base path (`base: "./"`), so it also works under a sub-path.

## Songs disappeared? (IndexedDB troubleshooting)

IndexedDB belongs to ONE address (protocol + host + port). The saved accounts and songs are
only visible from the same address they were created on. The page shows that address under the
playlist ("Songs are saved only in this browser, for the address ...").

- Always open the same address, for example `http://localhost:5173`. `localhost`,
  `127.0.0.1` and `localhost:5174` are three different storages. Dev server and preview
  server (`4173`) are different storages too, and so is every deployed URL.
- `npm run dev` now fails if port 5173 is busy instead of silently moving to another port.
  Close the previous dev server (`Ctrl + C` in its terminal) and start again.
- Do not use private / incognito windows: the browser deletes everything when they close.
- Check the browser setting "Clear cookies and site data when you close all windows"
  (Chrome, Edge, Brave) or "Delete cookies and site data when Firefox is closed". It must be off,
  or `localhost` must be added to the exceptions.
- Do not use "Clear site data" in the DevTools Application tab, and do not clear browsing data.
- The songs belong to the account that added them. Signing in with a different username
  shows that user's own (empty) playlist.

## Project structure

```
src/
  structures/DoublyLinkedList.ts   Node + list (prepend, append, insert, removeAt, move)
  player/Playlist.ts               Ordered playlist, current node, next / previous
  player/AudioEngine.ts            The single <audio> element
  player/SingleInstanceGuard.ts    Pauses other tabs
  player/PlayerController.ts       Coordinates playlist, audio and storage
  player/MediaSessionAdapter.ts    Media keys / lock screen
  services/Database.ts             IndexedDB wrapper
  services/SongRepository.ts       Saves songs, audio blobs and order
  services/AuthService.ts          AuthService interface + local implementation
  services/MetadataReader.ts       Tags and cover art
  ui/                              Login view, library view, toasts, helpers
```

## Notes

- Accounts and songs live in the browser of each device (that is what keeps songs local).
  `AuthService` is an interface: to use a cloud login (Firebase Auth, Supabase, Auth0...)
  write another implementation and pass it in `src/App.ts`.
- Clearing the site data of the browser removes the saved songs and accounts.
  The app asks the browser for persistent storage so they are not evicted automatically.
- Supported formats depend on the browser (MP3, M4A/AAC, WAV, OGG, Opus and FLAC work in
  current browsers).
