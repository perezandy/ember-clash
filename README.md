# ⚔️ Ember Clash

A turn-based combat game that runs entirely in the browser. No server, no build
step required — the project root **is** the production build.

## How to play

- **Attack** deals basic damage. **Guard** halves the next enemy hit.
- **Skills** (max 4, starting with Power Strike — 150% for 25 energy) are
  **learned on level-up**: each level-up grants a random skill from the pool
  matching your new level; with all 4 slots full you choose which skill to
  replace. Skills cost **energy** — energy is the only gate — and energy
  regens a flat amount each turn (10, tuned in `tuning.js`).
  **Magic is your max energy**: it sets the size of your energy pool (plus
  Deep Lungs, capped at 150), and it grows 2–4 per level. The pool
  includes damage, buff, heal, type-specific skills (e.g. Beasthunter is
  200% against beasts), and **element skills** (fire / ice / lightning).
  Elements are
  attack types only: every creature has an element profile (one weakness
  at 1.5×, one resistance at 0.5×, one neutral), so Ember Jab (fire) hits
  beasts hard but is resisted by demons, and so on — the Bestiary shows
  each creature's element profile.
- **Items** (Potion, Energy Vial, Elixir) are **single-use**, bought in the
  shop, consumed in battle. **HP and energy carry over between battles** —
  wins and level-ups do not restore anything, so resting in a shop bed
  (cost scales with the stage) is how you recover (it restores both HP and
  energy).
- **Defeat ends the run completely** — there is no retry and **no
  carried-over progress**. When you fall, a New Run starts you back at the
  beginning: level 1, no gold, no items, no equipment (bestiary and
  win/loss records stay, as they are records).
- **Equipment** replaces the old text upgrades: the shop sells **four
  pieces — Helmet, Chestplate, Leggings, Sword — in five tiers each**
  (Iron, Steel, Mithril, Runed, Dragon). Each tier has its own color
  scheme, and your hero's model recolors the matching part as you buy
  (the shop shows the item's SVG and the next tier you can purchase).
  Helmet boosts item healing, Chestplate max HP, Leggings magic (your max
  energy — the old Deep Lungs was removed for this reason), and the Sword
  combines attack + crit chance + crit damage with prices rising per tier.

**Progression:** each stage win grants XP and gold. XP levels you up — stats
(attack, defense, magic, max HP) grow by a random amount per level, and you
learn a skill. **Equipment tiers** (shop, stages ending in 5) are the
permanent boosts: 5 tiers per slot, cumulative effects, each tier a distinct
color on your hero. **Each stage draws from a limited enemy pool** —
the pools follow the biomes (forest: spiders/skeletons/slimes, crystal
cavern, dungeon, walkway, dark castle), cycled in endless mode. Enemies
also have **Magic** — their max energy, which regens (flat, per turn) so
  they can use their skills (Enrage, Shell, Venom, Web Spray, Brood
  Toxin). A **boss** appears
every 10 stages — the forest's is **The Broodmother** (Web Spray lowers
your accuracy, Brood Toxin poisons you for 5 turns, bite for standard
damage) — and the campaign is **won at stage 50**: the final boss
(Umbra, Dark Reflection). The campaign spans **5 biomes of 10 stages each**
(forest, crystal cavern, dungeon, mountain walkway, dark castle), with
bosses fighting in their own biome. Losing ends the run (New Run from
scratch at level 1). All progress is persisted in `localStorage`.

## Running locally

```bash
# any static server works, e.g.:
python3 -m http.server 8000
# then open http://localhost:8000
```

(Or just open `index.html` via a server; ES modules require `http://`, not `file://`.)

## Tests

```bash
node tests/smoke.mjs   # exercises save, stats, upgrades, progression, enemies, full combat fights
```

## Building (there is no build step)

The production output is the project root as-is:

```
index.html
css/
js/
assets/
```

All asset references are **relative** (`css/styles.css`, `js/main.js`), and the
game uses no fetch/XHR, web workers, or server-side code. This means it works
when deployed from **any base path**, including a GitHub Pages repository
subdirectory (e.g. `https://user.github.io/repo-name/`) — no path
configuration is needed.

If you add assets (images, audio), keep referencing them with relative paths so
the subdirectory deployment guarantee holds.

## Deploying to GitHub Pages

Option A — **docs folder** (recommended, no extra branch):

1. Copy the production files (`index.html`, `css/`, `js/`) into a `docs/` folder.
2. Commit and push.
3. In the repository's GitHub settings, enable Pages with `docs/` as the source.

Option B — **`gh-pages` branch:**

1. Create a `gh-pages` branch containing `index.html`, `css/`, `js/` at its root.
2. Push it; GitHub Pages serves it at `https://user.github.io/repo-name/`.

## Architecture (decoupled engine + content pack)

The game is split into three layers so the battle engine is **fully
reusable** and all Ember-Clash-specific data lives in one content pack:

```
index.html            DOM skeleton for all screens; loads js/main.js as an ES module
css/styles.css        All styling
assets/bg/            Battle environment pixel art (AI-generated, studio pipeline)
assets/sprites/       Hand-crafted vector SVG characters (primitives + Bezier paths, layered <g> groups, gradient shading)

js/engine/engine.js   GENERIC battle engine. Zero imports, zero knowledge of
                      Ember Clash. Injected with a content pack + host adapter
                      ({bus, rng, delay}); owns the turn state machine, damage
                      math, skill activation, buff/status system, AI intent
                      rolling and fx description.

js/content/           EMBER CLASH CONTENT PACK (data + pure content functions).
  tuning.js           Every balance number. Tune the game here only.
  skills.js           Data-driven skill + enemy-skill catalogs, the tier system.
  enemies.js          Creature types/elements, enemy defs, per-stage pools,
                      biome bosses, and the stage -> enemy factory.
  index.js            Assembles the pack the engine is injected with.

js/game/              EMBER CLASH APP (host: wires the engine to Ember Clash).
  combat.js           `Combat` — a thin `BattleEngine` subclass that injects
                      the Ember Clash pack + host services (bus/rng/timer).
  player.js           Player model: persisted fields + derived stats (the generic hero).
  progression.js      XP/levels, stage rewards, stage advancing, skill learning.
  equipment.js        Data-driven equipment catalog: 4 slots x 5 tiers.
  upgrades.js         XP curve.
  bestiary.js         Bestiary records of defeated creatures.

js/core/              Generic infrastructure (shared by engine + app).
  events.js           Tiny typed event bus — the contract between game and UI.
  rng.js              Random helpers.
  save.js             Versioned localStorage persistence (key: combat-game.save.v5).
  audio.js            WebAudio SFX (mute toggle).

js/ui/                UI (never imports game; reads bus events only).
  screens.js          Screen switching.
  hud.js              Bars/sprites from 'state'/'phase' events; recolors the hero model per equipment.
  equipIcons.js       Tier color schemes + inline item SVGs for the shop.
  log.js              Combat log from 'log' events.
  attackFx.js         Canvas particle FX from 'fx' events.

js/main.js            App wiring: owns the save object and routes events.
tests/smoke.mjs       Node smoke test for all DOM-free modules.
```

**The three layers and their boundaries:**

- **Engine (`js/engine/`)** — generic and content-agnostic. It reads
  everything through the injected `content` pack and `adapter`, and reads the
  hero through a small interface (`stats()`, `skills`, `items`,
  `removeItem()`). It imports **nothing** from `content/` or `game/`.
- **Content (`js/content/`)** — every Ember-Clash fact: skills, monster
  types, the tier system, statuses, fx mapping, tuning. Data + pure
  functions only. It imports nothing from the engine.
- **App (`js/game/`, `js/main.js`)** — Ember-Clash glue: builds the hero
  (Player) and enemies, constructs `Combat` (injecting the pack), and routes
  bus events to the UI.

**Rules that keep changes local:**

- **Game modules never import UI modules, and UI modules never import game
  modules.** They communicate only through the `EventBus` names documented in
  `js/core/events.js` (`log`, `state`, `phase`, `hit`, `fx`, `sfx`).
- **Balance changes** → edit `js/content/tuning.js` only.
- **New/changed skill** (player or enemy) → add one entry to `SKILLS` /
  `ENEMY_SKILLS` in `js/content/skills.js`. The engine interprets the
  declarative effect fields; no engine or app code changes.
- **New/changed monster** → add one entry to `ENEMY_DEFS` (and, if new, its
  `type` to `TYPES`) in `js/content/enemies.js`. Give it a sprite id and add
  the SVG to `assets/sprites/`. Optional generic schema fields:
  `behavior: 'fleeOnHit'`, `attackStyle: {fx, mult, tier}`, `loot: {gold,
  items}`, `elementWeakness: {...}`.
- **New equipment piece** → add an entry to `EQUIPMENT` in `js/game/equipment.js`
  (and its color scheme in `js/ui/equipIcons.js`).
- **New status effect** → add it to `content.statuses` in `js/content/index.js`
  (a conditional status carries `element` + `chance`; a tick status carries a
  `tickLog`), list its key in `content.buffKeys`, and add its label to
  `content.buffLabels` + its tick order to `content.statusTickOrder`.
- **New/changed sprite** → edit the SVG in `assets/sprites/` directly; keep the
  conventions (clean viewBox 0 0 800 800, layered <g> ids, gradients in <defs>).
  The **hero** is an inline `<svg>` in `index.html` (four recolorable
  equipment groups driven by CSS variables; see `js/ui/equipIcons.js`).
- **New screen** → add a `<section class="screen hidden" id="screen-…">` to
  `index.html` and a case in the flow in `js/main.js`.
- **New action** → add handling in `BattleEngine.act()` / `canAct()`
  (`js/engine/engine.js`) and a button in `index.html` + `js/main.js` binding.
- **Serve a different game on the same engine** → write a new content pack
  (`js/content/`) + hero/enemy builders, and construct `BattleEngine` with it.
  `js/engine/engine.js` is untouched.

## Save format (v4)

```json
{
  "version": 4,
  "player": {
    "level": 1, "xp": 0, "gold": 0,
    "stats": { "attack": 16, "defense": 0, "magic": 25, "maxHp": 100,
               "critChance": 0.1, "critDamage": 2.0 },
    "skills": ["powerstrike"],
    "items": { "potion": 2, "vial": 0, "elixir": 0 },
    "equipment": { "helmet": 0, "chest": 0, "legs": 0, "sword": 0 },
    "currentHp": null,
    "currentEnergy": null
  },
  "stage": 1,
  "stats": { "wins": 0, "losses": 0, "kills": 0 }
}
```

Stored under the `localStorage` key `combat-game.save.v4`. v3/v2/v1 saves
are migrated automatically on load (old text upgrades map onto equipment
tiers; Deep Lungs and Bounty Hunter are dropped). Changing the schema?
Bump `VERSION` in `js/core/save.js` and add a migration for the previous
version.
