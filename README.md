# Jev Plays Pokémon Red

[Jev](https://en.wikipedia.org/wiki/Jev_(AI_model)), TypeSafe AI's decision model, plays Pokémon Red. There are no scripts or cheats: the harness reads the game's memory, lists the legal options with some facts about each, and Jev picks one.

Landing page: [jev-pokemon.vercel.app](https://jev-pokemon.vercel.app) ([`site/`](site/))

## Result

Jev beat the game. The live stream ran on YouTube from Sep 25 to Sep 26, 2026 and has ended. The highlights are on the landing page.

| | |
|---|---|
| Total time | 37h 40m |
| Decisions made | 16,150 |
| Input tokens | ~39.2M |
| Total Jev cost | ~$1.65 |
| Median decision time | ~0.4s |
| Team wipes | 16 (14 at the Elite Four) |
| Elite Four attempts | 15 |
| Final team | Charizard 83, Graveler 62, Nidoqueen 45, Beedrill 44, Haunter 39, Primeape 29 |

> You need your own legally obtained copy of Pokémon Red. No ROM is included or distributed here. See [Legal](#legal).

## How it works

```
 Game Boy emulator (Node) ──► read RAM ──► game state (map, party, battle, on-screen text)
          ▲                                          │
          │ button presses                           ▼
   harness mechanics ◄── Jev picks one ◄── legal options + facts
   (A* pathfinding, menus)                (type matchups, damage estimates,
                                           "2 areas toward the objective", ...)
```

- **Jev decides:**
  - every menu answer (names, starter, YES/NO, shop, heal, learn/forget moves)
  - what to focus on (progress, heal, train, catch, shop, explore, team)
  - which Pokémon to catch, and which to swap in and out of the team at the PC
  - where to go and who to talk to
  - every battle action (move, switch, item, ball, run)
- **The harness never decides:**
  - It only reads memory and presses buttons. It never writes to game memory.
  - Game knowledge is limited to the story milestones (what the next goal is and where it happens) in [`src/knowledge/milestones.ts`](src/knowledge/milestones.ts). Progress is checked against the game's real event flags.
  - Hidden items aren't shown to Jev, since a human wouldn't know where they are.
- **House rules:**
  - Text speed FAST and battle animations OFF, set once in the Options menu at boot.
  - The player is named JEV and the rival BLUE.
  - Every caught Pokémon gets a nickname: Jev spells it one letter at a time (A–Z or DONE). It has to be a made-up name, not a species name or a nickname already in use.
- **Loop protection:**
  - Options that were already tried without anything changing get tagged, and Jev is told to try something new.
  - If the same failing choice keeps coming back, the harness samples an alternative.
  - As a last resort, it reloads the latest milestone checkpoint.

## Setup

Requirements: macOS or Linux, Node 20+, and git.

```bash
git clone https://github.com/christianmat/jev-pokemon && cd jev-pokemon
npm install
npm run setup                 # installs rgbds (via brew), clones + builds pret/pokered, generates symbol data
cp /path/to/your/pokered.gb roms/red.gb   # your own dump of Pokémon Red (US/EU)
cp .env.example .env          # then fill it in
```

The ROM must be the US/EU release. Its SHA-1 is `ea9bcae617fdf159b045185467ae58b2e4a48b9a`, the same build pret/pokered produces. The harness reads RAM addresses from that disassembly, so other versions won't work.

### `.env`

| Variable | What it does |
|---|---|
| `JEV_MODE` | `gateway` for real Jev via Vercel AI Gateway, `mock` for a free, dumb stand-in (the default) |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key (`VERCEL_AI_GATEWAY_API_KEY` also works) |
| `JEV_MIN_INTERVAL_MS`, `JEV_MAX_PER_MIN` | Throttling (defaults 300 ms and 90 per minute) |

## Run

```bash
npm start -- --speed 1                         # real-time; local viewer at http://localhost:8787
npm start -- --speed 1 --resume                # continue from the latest milestone checkpoint
npm start -- --speed 1 --load <save-name>      # load a specific save from saves/
npm run headless -- --steps 3000               # max speed, logs only
npx tsx scripts/tools/save.ts                  # save the running game (writes saves/manual-*.json)
```

### Logs

- `logs/jev-calls.jsonl` has every Jev call: the full state, the options with their facts, the probabilities, and the latency.
- `logs/events.jsonl` has maps, milestones, saves and errors.

## Cost

- **Price:** Jev costs $0.042 per million input tokens, and output is free. A typical call is about 1,200 tokens.
- **Rate:** at real-time speed the bot makes about 800–1,300 calls an hour. That comes to **about $1–1.70 per 24 hours**.
- **Ceiling:** the throttle's worst case, 90 calls a minute nonstop, is about $7 a day.

## Project layout

| Path | What |
|---|---|
| `src/emu/` | emulator wrapper (serverboy / GameBoy-Online core), save states, audio tap |
| `src/game/` | ROM tables, RAM reader, collision grid + A*, region graph |
| `src/jev/` | Jev client (throttle, cache, log), AI SDK gateway backend, mock |
| `src/agent/` | mode detection, dialog and menus, overworld, battle, field moves and items |
| `src/knowledge/` | story milestones |
| `src/server/` | runner + local WebSocket viewer |
| `web/` | local viewer page |
| `site/` | public landing page (static; deploy with Vercel, root directory `site`) |
| `scripts/` | setup, data generation, debug tools |

## Deploying the landing page

`site/` is plain static HTML with no build step:
1. Create a Vercel project from this repo.
2. Set **Root Directory** to `site`.
3. Deploy.

The highlights video (`site/highlights.mp4`) and links are in `site/index.html`.

## Legal

- **No ROM included.** This repo doesn't contain or link to Pokémon Red, and you need your own legally obtained copy. `roms/` is gitignored.
- **No Nintendo assets.** Game data (symbols, names, maps, font) is read at runtime from *your* ROM. The symbol file is generated locally from the [pret/pokered](https://github.com/pret/pokered) disassembly during `npm run setup`, which clones it into `vendor/`. That disassembly isn't redistributed here, and `vendor/` and `src/data/generated.json` are gitignored.
- **Not affiliated.** Pokémon is a trademark of Nintendo, Creatures Inc. and GAME FREAK inc. This is a fan experiment, not affiliated with or endorsed by Nintendo, Game Freak, The Pokémon Company or TypeSafe AI.
- **License.** GPL-2.0-or-later (see [`LICENSE`](LICENSE)), because it builds on the GPL-licensed [serverboy](https://gitlab.com/piglet-plays/serverboy.js) / GameBoy-Online emulator core.

Made by [Christian Mathiesen](https://github.com/christianmat) at [Frigade](https://frigade.com/?utm_source=jev-pokemon&utm_medium=readme).


## Self-hosted probability model

Set `JEV_MODE=endpoint`, `JEV_ENDPOINT` to an OpenAI-compatible chat-completions URL,
and `JEV_MODEL` to the served model name. Optional `JEV_ENDPOINT_KEY` supplies bearer
authentication. This backend sends user-only State/Options requests with letter labels,
temperature zero and `chat_template_kwargs.enable_thinking=false`. Responses must be
JSON probabilities for every offered label, summing approximately to one. The rounding allowance is the greater of 2%
and half a hundredth per option, accounting for two-decimal outputs with many choices.
Rounded distributions are normalized for harness sampling; argmax is unchanged.
Raw responses remain in the audit log. Invalid responses fail and
use the existing request retries; there is no mock fallback.
`logs/model-responses.jsonl` preserves requests and raw responses without auth headers.

Set `HOST` to the server's Tailnet IP and `PORT=8787` for cross-machine browser access.
The viewer uses a same-origin WebSocket and exposes `/api/status` for health checks.
Start with `npm start -- --speed 1 --resume`. With no save, this starts a new adventure;
otherwise it resumes the latest completed save, including autosaves and manual saves.
Set `STUCK_RELOAD=Infinity` to prevent automatic checkpoint rollback. Existing exploration
can sample alternatives when stuck. Autosaves occur every five minutes and at milestones;
SIGINT/SIGTERM saves before exit. No automatic new-game repetition is enabled.

The viewer shows the latest uncached call time and the elapsed time on every decision.
These timings include request throttling and retries, rather than GPU inference alone.
Cached decisions are marked separately and do not replace the latest call time.

### Battle decision safety

The controller reads Disable from live game memory and excludes disabled moves and moves with no PP from regular battle and move-menu choices. When none remain, FIGHT uses STRUGGLE. Move-learning menus are unaffected. Battle and menu decisions always call the model; only overworld decisions reuse cached answers. This answer cache is separate from inference-server prefix caching.

Valid, finite option weights in [0, 1] are normalized when their total is positive, even if the total differs from one. Large corrections emit a probability-normalization warning; original endpoint responses remain in the raw response log. Malformed JSON, duplicate/missing/unknown labels, negative or out-of-range weights, and all-zero outputs are rejected.

Single-option questions are resolved by the shared request client without inference, including direct overworld requests. These are controller selections, with no fabricated model probabilities or model-call counts. Mixed requests send only questions that need a decision to the model.

The viewer shows input tokens for the latest model call and each uncached decision, alongside the cumulative total across calls since the harness restart. Cached decisions do not replace the latest-call token count.

Per-call usage is included in live decision messages and the latest-call count is restored from status on reconnect. The viewer also supports already-running older servers by subtracting consecutive cumulative usage totals; no server restart is required for this display fix.
