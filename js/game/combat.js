// Ember Clash COMBAT: a thin host over the generic battle engine.
// All battle logic lives in js/engine/engine.js; this file only injects the
// Ember Clash content pack and the host services (event bus, random source,
// timer) and preserves the public API the game and tests use.
//
// To make the battle engine serve a DIFFERENT game, swap `EMBER_CLASH` for
// another content pack and adapt the hero/enemy builders — this file's shape
// (and the engine) stay the same.
import { BattleEngine } from '../engine/engine.js';
import { EMBER_CLASH } from '../content/index.js';

export class Combat extends BattleEngine {
  constructor(player, enemy, bus, startHp = null, startEnergy = null) {
    super(EMBER_CLASH, {
      bus,
      // Read Math.random fresh on every roll so a host (e.g. tests) can pin
      // determinism by reassigning Math.random.
      rng: () => Math.random(),
      delay: (ms, fn) => setTimeout(fn, ms),
    });
    this.setup(player, enemy, startHp, startEnergy);
  }
}
