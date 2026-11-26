# 🎲 Snake & Ladder Promo — online multiplayer marketing game

A branded, mobile-first Snake & Ladder game for promos, events and giveaways.
Up to **10 players per room** on **one shared board**. Players **take turns rolling the dice**;
when it's your turn a **"Your turn, Michael!"** pop-up appears. If you don't roll within
20 seconds, the computer rolls for you. Joining needs **only a name**. First to 100 wins.

Built with **Next.js 16 + React 19 + TypeScript + Tailwind CSS 4**, **Supabase**
(PostgreSQL + Realtime) and deployable on **Vercel**.

---

## Features

**Gameplay**
- Rooms of up to 10 players, joined by room code, share link or QR code
- Lobby with ready status. Only the host can start, and only once **everyone is ready**
- Join with just your name (avatar and color are assigned automatically). Registration fields are optional and off by default
- One shared board per round (random, or one of the admin's custom layouts). All 10 pawns are visible, spread out when they share a square
- Random first player, then turns go in join order. A big turn banner shows whose turn it is, with a countdown ring
- **"Your turn, <name>!" pop-up** with a ROLL button, a chime and phone vibration. On phones the ROLL button also sticks to the bottom of the screen
- Turn timer (default 20s). When time runs out, or a player left or went offline, the computer rolls for them so the game never gets stuck
- Dice roll animation, then the pawn moves square by square, climbs ladders and slides down snakes, with sound effects (mute toggle)
- Players list in turn order, live game log, an "exact roll to 100" option, an optional extra turn on a 6, and a 1st/2nd/3rd place mode
- Confetti winner screen, prize details, unique winner coupon codes and a thank-you code for everyone else
- Rematch in the same room, spectator mode and an organizer "host screen" for projectors
- Disconnects don't break the game. Players reconnect by reopening the link. If the host drops out of the lobby, someone else becomes host

**Marketing**
- Campaign branding: logo, 4 brand colors, background image, promo banner, sponsor logos
- Welcome page with mechanics, prizes and campaign dates
- Optional registration (name, email, phone and custom fields; each can be on/off and required or optional)
- Optional **marketing consent checkbox**, separate from joining. Every choice is logged with the exact wording shown
- CTA buttons ("Visit our Facebook page", "Claim your reward", …) shown on the landing, lobby, game or finish screen, with click tracking
- Milestone pop-ups (reach square 50, climb a ladder, hit a snake, finish)
- Privacy notice page and a data-retention period per campaign

**Admin dashboard** (`/admin`)
- Create, edit and delete campaigns, set their status and start/end dates
- Branding, content, game rules, board layouts, registration fields, consent text and privacy notice, CTAs, milestones, prizes and coupons
- Event rooms hosted by the organizer, with an organizer screen to start, pause, roll for the current player, end or start a new round
- Metrics: players, unique participants, games played, winners, CTA clicks (per button) and marketing opt-ins
- Participants table, rooms and game history, winners list, and **CSV export** for participants and winners
- An "apply retention now" button that anonymises expired personal data

---

## Quick start (local, no database needed)

```bash
npm install
cp .env.example .env.local      # set ADMIN_PASSWORD and APP_SECRET
npm run dev
```

Open http://localhost:3000. Admin is at http://localhost:3000/admin (in development the password is `admin` unless you set `ADMIN_PASSWORD`).

Without Supabase keys, the app uses a **local in-memory store** that is saved to `.data/dev-db.json` and comes with a demo campaign already set up.
This is great for trying the app out. **It is not for Vercel**, because serverless instances don't share memory.

### Test alone with bots
1. Open the site, click **Host a new game** and create a room.
2. Fill the room with 9 bots. They join, tap READY and roll on their own turns:
   ```bash
   node scripts/bots.mjs ROOMCODE 9 http://localhost:3000
   ```
3. Press **Start game** and wait for your "Your turn" pop-up. Use `--no-play` if you want the bots to only join.

### Automated tests
```bash
npm test                                   # game engine unit tests
npm run build && npm start                 # then, in another terminal:
BASE_URL=http://localhost:3000 npm run simulate
```
`simulate` runs a complete 10-player game over the real API and makes 50 checks. They cover:
- joining, a full room, required registration fields, ready and start rules, and host-only actions
- rolling out of turn is rejected, and 5 rapid taps on ROLL count as **exactly one** roll
- the turn timer: when time runs out the computer rolls once, even with 10 clients calling at the same moment
- server moves that match the board, winners, coupons, CTA tracking, CSV exports and rematch

---

## Putting it online on Render (simplest, like the bingo game)

No database needed: the app runs as one normal Node server and keeps data in memory (saved to `.data/` on the server's disk).

1. Push this folder to a GitHub repository.
2. Sign in at https://render.com with GitHub, then choose **New → Blueprint** and pick the repository. Render reads `render.yaml`.
3. When asked, enter an **`ADMIN_PASSWORD`** (your password for `/admin`). `APP_SECRET` is generated automatically. Click **Apply**.
4. Wait for the first build (about 3–5 minutes). Players open `https://<your-app>.onrender.com`, and the admin is at `/admin`.

Things to know on the **free plan**:
- The server **sleeps after ~15 minutes idle**. The first visit wakes it in about 30–60 seconds, so open it a minute before the event. During a game, the players' screens keep it awake.
- **Restarts and redeploys wipe the data**: campaigns you edited, rooms, participants and winners. Download the participants/winners CSVs from `/admin` after each event.
  To keep data permanently, set up Supabase as described below and add its keys in Render's **Environment** tab. Nothing else changes.
- Each push to GitHub redeploys automatically.

---

## Production setup: Supabase + Vercel

### 1. Supabase
1. Create a project at https://supabase.com.
2. In **SQL Editor**, run `supabase/migrations/20261126000000_init.sql`, then `supabase/seed.sql` (the demo campaign).
   If you use the Supabase CLI, run `supabase link` then `supabase db push` instead.
3. Under **Project Settings → API**, copy the Project URL, the `anon` key and the `service_role` key.
4. Realtime: the app uses **public Broadcast channels** named `room-<CODE>`. In **Realtime → Settings**, keep "Allow public access" **enabled**.
   If it's disabled, the game still works, but it falls back to polling every 4 seconds.
5. Optional: to anonymise old registrations automatically, enable `pg_cron` and run:
   ```sql
   select cron.schedule('purge-pii', '0 3 * * *', $$select public.purge_expired_participant_data()$$);
   ```

### 2. Vercel
1. Push this folder to a GitHub repo and import it in Vercel (framework: Next.js).
2. Add these environment variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key (only used to listen to broadcast pings) |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**server only**) |
| `ADMIN_PASSWORD` | a strong password for `/admin` |
| `APP_SECRET` | 32+ random chars: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

3. Deploy, open `/admin`, edit the demo campaign (or create your own) and share `/c/<slug>`.

---

## How it works

```
Browser ──fetch──▶ Next.js API routes ──service role──▶ Supabase Postgres
   ▲                     │  (all rules + dice rolls happen here)
   └── Realtime ping ◀───┘  broadcast "room-CODE" {v}  → client re-fetches state
```

- **Server-authoritative.** Clients only send intents: join, ready, start, tick, leave and so on. Ball numbers come from `crypto.randomInt` on the server, and moves are calculated on the server. The client never sends positions.
- **One roll per turn.** Each room has a `game_states` row with a JSON state and a `version`. Every change is a compare-and-swap (`update … where version = $expected`), and each roll carries the turn number, so double rolls, out-of-turn rolls and double starts can't happen.
- **Turn timer without a background worker.** The state stores `turnEndsAt`. The first request that arrives after the deadline makes the computer roll for that player, whether that's a client's `tick` or a state poll, and every other request sees the new version. This works on serverless platforms such as Vercel.
- **Private data stays private.** RLS is enabled on every table with no anon policies. The browser never queries tables, and realtime messages carry only a version number. Player tokens are random, stored hashed (SHA-256 + `APP_SECRET`) and kept in the player's `localStorage` so they can reconnect.
- **Admin auth** uses an HMAC-signed, httpOnly cookie (12h) and a rate-limited login. Every admin API route and page checks it.
- **Input validation.** All admin config is normalised and clamped server-side, including URLs, colors, counts and board layouts. Registration fields are validated against the campaign config, and CSV exports are protected against formula injection.
- **Rate limits.** Each API has a limit per IP. These limits are in-memory per instance, which is enough to stop spam. For strict global limits, add Upstash or Vercel KV.

### Project layout
```
src/lib/engine.ts            pure game rules (board generation, moves, turns)
src/lib/defaults.ts          default campaign + config validation
src/lib/server/game.ts       room service: join, roll, turn timer, winners, view
src/lib/store/               Store interface: supabase.ts (prod) / memory.ts (dev)
src/app/api/...              REST endpoints (rooms, actions, cta, admin)
src/components/RoomClient.tsx lobby / game / finish screens
src/components/Board.tsx     SVG board, snakes, ladders, animated pawns
src/app/admin/...            dashboard, campaign editor, participants
supabase/migrations          schema, indexes, RLS, retention function
supabase/seed.sql            demo campaign
scripts/simulate.mjs         10-player end-to-end test
scripts/bots.mjs             fill a room with bots for manual testing
```

### Main routes
| URL | What |
|---|---|
| `/` | landing page of the active campaign |
| `/c/<slug>` | landing page of a specific campaign |
| `/join/<CODE>` | join form (QR codes point here) |
| `/room/<CODE>` | player view (`?watch=1` = spectator) |
| `/host/<CODE>` | organizer screen (admin only) |
| `/privacy/<slug>` | privacy notice |
| `/admin` | dashboard |
