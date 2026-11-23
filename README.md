# Typewriter Journal

A notes journal that types like a typewriter. The page slides under a fixed red cursor, and you tear a sheet off to file it. Torn sheets get pinned to a **Board**, where your notes hang off a tree of projects.

**Live:** https://kirizakuga.github.io/typewriter-journal/

## Where notes are saved

The page picks the first option that is available:

| Mode | When | Storage |
|---|---|---|
| Cloud | `config.js` has a Supabase URL and anon key | Supabase Postgres, one private row per signed-in user |
| Local server | The page is opened through `npm start` | `data/journal.db` (SQLite) |
| Browser only | Neither of the above | `localStorage` |

The browser always keeps an offline copy too. Edits made offline are uploaded when the connection comes back. Every save carries a revision number, so an outdated tab or device can't overwrite newer notes.

## Cloud setup (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql) and run it.
3. Go to **Authentication → URL Configuration**. Set **Site URL** to the live URL above, and add it under **Redirect URLs**. Add `http://localhost:3000` there too if you use the local server.
4. Go to **Project Settings → API**. Copy the **Project URL** and the **anon public** key into [`config.js`](config.js).
5. Optional: once your own account exists, turn off **Allow new users to sign up** under **Authentication → Providers → Email**, so nobody else can create an account.

The anon key is meant to be public. Row-level security in `schema.sql` lets each user read and write only their own journal.

## Run locally

```sh
npm start        # http://localhost:3000, needs Node 22.5+
```

## Keys

- Type to write. **Enter** makes a new line. **Ctrl/Cmd+Enter** tears off the sheet, and so does dragging sideways anywhere.
- **Ctrl+Alt+N** starts a new sheet.
- On the **Board**: drag empty space to pan, scroll to zoom, drop a note on a project to move it there, and double-click a note to open it.
