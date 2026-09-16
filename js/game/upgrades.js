// XP curve. (Stat boosts moved to the equipment catalog in
// js/game/equipment.js; the old text upgrades are retired.)
import { TUNING } from '../content/tuning.js';

export function xpForNext(level) {
  return TUNING.xp.base + (level - 1) * TUNING.xp.perLevel;
}
