# Family Secret Santa 🎁

A festive Secret Santa web app for families who live in different countries.

- **Organizer** adds everyone's names and the gift budget (default €20–€30), then presses
  *Draw names & create links*.
- Everyone gets a **private magic link**. The organizer copies or shares each link (WhatsApp, email, text).
- Opening a link shows a **gold scratch card**: scratch it with a finger or mouse (or tap *reveal*)
  to see who you're buying a gift for.
- The organizer dashboard shows who has opened / revealed their card — **never who drew whom**.
- Nobody can draw themselves (names are drawn as one random cycle on the server).
- *Redraw names* keeps the same links but gives everyone a new person.

Mobile-first, with desktop layouts. All screens are in Latvian ("Slepenais rūķītis").

## Adventes kalendārs (Advent calendar)

A family-memory guessing game for 1–24 December, in Latvian, reached from each person's existing
Secret Santa link (`#/s/<token>/advent`) — no new links or accounts.

- **Memories:** participants answer whichever questions they like ("Manas atmiņas"); they can edit or
  delete a memory until its day opens. Memories stay private until they appear in the calendar.
- **Memories go straight in:** a saved memory is placed on a random empty day that hasn't opened yet,
  exactly as written (no review, no text correction). The author can edit or delete it until that day opens.
- **Organizer** (`#/o/<admin_token>/advent`, linked from the dashboard): optional - look at memories, move
  one to another day or remove it. Authors are hidden by default. Days that have already opened can't be changed.
- **Calendar:** one door per day, opening at 00:00 Latvian time (`Europe/Riga`). Missed days can be opened
  later. One guess per memory (enforced by a unique constraint); the author is revealed right after guessing.
- **Points:** correct on the 1st attempt +7, on the 2nd attempt +4. Streak bonuses for guessing on the day itself: 3 days +1, 5 days +1,
  7 days +2, 14 days +2, all 24 days +3. Late guesses earn the 7 points but don't count for streaks;
  your own memory's day is neutral. Earned bonuses are never removed.
- **Finale:** standings, winner badge and ties are only revealed from 24 December. Guessing closes after the 24th.

- **Settings** (organizer → "Iestatījumi"): time zone for door opening, points per correct guess,
  streak bonus milestones (up to 8) and the all-24-days bonus. They can be changed until 1 December and
  are then locked, so nobody's earned points can change mid-game.

Scoring is computed in the database from immutable guess records; the browser can't write points.

## Tech

- Vite + vanilla JS front-end (`src/`)
- Supabase Postgres back-end (`supabase/migrations/`)
  - Tables have Row Level Security on and no policies, so they can't be read from the browser.
  - The browser only calls token-checked `SECURITY DEFINER` functions:
    `create_event`, `get_event_admin`, `redraw_event`, `open_card`, `reveal_card`.
  - Tokens are 96-bit random, URL-safe strings.

## Run locally

```bash
npm install
npm run dev
```

The Supabase URL and publishable key are set in `src/api.js` (publishable keys are safe to ship to
browsers). Override them with `VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` if needed.

## Deploy

Any static host works (Vercel, Netlify, GitHub Pages…): build with `npm run build` and serve `dist/`.
Links use the `#/o/<token>` (organizer) and `#/s/<token>` (participant) hash routes, so no server
rewrites are needed.
