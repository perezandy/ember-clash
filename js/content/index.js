// Ember Clash CONTENT PACK. This is the single object the generic battle
// engine (js/engine/engine.js) is injected with. It bundles every piece of
// game-specific data the engine needs:
//   - types / element affinities
//   - status effects (data-driven)
//   - fx mapping + buff display labels (data-driven)
//   - the damage-tier system
//   - the skill + enemy-skill catalogs
//   - all balance tuning
//
// The engine has ZERO knowledge of Ember Clash: it reads everything from
// this pack. To add/change/remove skills, monster types or status effects
// for a DIFFERENT game, you build a different pack and inject it — the
// engine is untouched.
import { TUNING } from './tuning.js';
import {
  SKILLS,
  SKILL_MAP,
  ENEMY_SKILLS,
  TIER_COSTS,
  TIER_MULTS,
  TIER_NAMES,
  TIER_BLOCKS,
} from './skills.js';
import { TYPES, INTENT_LABELS } from './enemies.js';

export const EMBER_CLASH = {
  // Creature type / element-affinity table (data).
  types: TYPES,

  // Status effects, described as data. `dot` is a damage-over-time buff the
  // engine applies generically; `burn` is a conditional status (set when an
  // attack of `element` lands). Both carry data-driven tick/apply log flavor.
  statuses: {
    dot: {
      key: 'dot',
      label: 'POISON',
      tickLog: (name, isPlayer, amount) =>
        isPlayer ? `Venom burns you for ${amount}.` : `Poison burns ${name} for ${amount}.`,
    },
    burn: {
      key: 'burn',
      label: 'BURN',
      element: 'fire',
      chance: TUNING.status.burn.chance,
      turns: TUNING.status.burn.turns,
      maxHpFrac: TUNING.status.burn.fracOfMaxHp,
      tickLog: (name, isPlayer, amount) =>
        isPlayer ? `Burn sears you for ${amount}.` : `Burn sears ${name} for ${amount}.`,
      log: (name, isPlayer, existed) =>
        isPlayer
          ? existed ? 'The flames around you intensify!' : 'You catch fire!'
          : existed ? `The flames around ${name} intensify!` : `${name} catches fire!`,
    },
  },

  // The order in which damage-over-time / conditional statuses tick each side
  // during the enemy turn (data, so a different game can reorder them).
  statusTickOrder: {
    enemy: ['dot', 'burn'],
    player: ['burn', 'dot'],
  },

  // How an attack is described to the fx layer, by element and by weapon.
  fx: {
    element: { fire: 'fire', ice: 'ice', lightning: 'lightning' },
    weapon: { blade: 'slash', default: 'blunt' },
    heal: 'heal',
    energy: 'energy',
  },

  // The ordered set of per-side status slots the engine tracks.
  buffKeys: ['damage', 'defense', 'hit', 'dot', 'web', 'defenseDown', 'burn'],

  // Display labels for the HUD buff readout.
  buffLabels: {
    damage: '+DMG',
    defense: '+DEF',
    hit: '+ACC',
    dot: 'POISON',
    web: 'WEB',
    defenseDown: 'DEF DOWN',
    burn: 'BURN',
  },

  // The damage-tier system (data): cost/multiplier/name per tier + the
  // 5-level blocks each tier is learnable in.
  tierCosts: TIER_COSTS,
  tierMults: TIER_MULTS,
  tierNames: TIER_NAMES,
  tierBlocks: TIER_BLOCKS,

  // Skill catalogs (data).
  skills: SKILLS,
  skillMap: SKILL_MAP,
  enemySkills: ENEMY_SKILLS,

  // Enemy intent display labels (data).
  intentLabels: INTENT_LABELS,

  // All balance numbers.
  tuning: TUNING,
};
