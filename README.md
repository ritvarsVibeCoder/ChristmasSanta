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

Mobile-first, with desktop layouts.

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
