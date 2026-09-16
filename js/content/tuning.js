// Central tuning values. Change numbers here; do not hardcode them elsewhere.
export const TUNING = {
  player: {
    baseAttack: 16,
    baseMaxHp: 100,
    baseDefense: 0,
    baseMagic: 25, // magic = max energy
    energyCap: 150,
    startEnergy: 50, // clamped to max energy for a fresh battle
    baseCritChance: 0.1,
    baseCritDamage: 2.0,
    potionHeal: 0.35, // fraction of maxHp
    // Per level-up: attack/defense gain a random amount in [statMin, statMax],
    // magic (max energy) in [magicMin, magicMax], maxHp in [hpMin, hpMax].
    levelUp: {
      statMin: 0,
      statMax: 2,
      magicMin: 2,
      magicMax: 4,
      hpMin: 12,
      hpMax: 28,
    },
    evasionBase: 0.03, // flat player evasion (no per-level scaling)
  },
  combat: {
    damageVariance: 0.15, // +/- fraction
    defendReduction: 0.5, // fraction of incoming damage blocked
    enemyChargeMultiplier: 1.6,
    enemyDefendReduction: 0.5,
    enemyActionDelayMs: 650,
    energyRegen: 10, // flat energy regen per turn (player and enemy)
    boss: { hpMultiplier: 1.8, atkMultiplier: 1.25 },
  },
  xp: { base: 30, perLevel: 20 }, // xpForNext(level) = base + (level-1)*perLevel
  spawn: {
    lootGoblinChance: 0.10, // a Loot Goblin can replace any non-boss stage's enemy
  },
  status: {
    // Burning: set by fire-type skills. Damage per turn as a fraction of the
    // enemy's max HP, for `turns` turns (refreshed to full on re-apply).
    burn: { chance: 0.15, turns: 3, fracOfMaxHp: 0.05 },
  },
  rewards: {
    xpBase: 12,
    xpPerStage: 4,
    xpBossBonus: 25,
    goldMin: 8,
    goldMax: 20,
    goldPerStage: 2,
  },
  stage: {
    bossEvery: 10,
    victoryStage: 50,
    enemyHpPerStage: 0.12,
    enemyAtkPerStage: 0.08,
    enemyEvasionPerStage: 0.004,
    enemyArmorEvery: 4,
    shopEvery: 10, // shop opens on stages ending in 5
    shopOffset: 5,
  },
  enemyAi: {
    weights: { attack: 60, charge: 12, defend: 12, skill: 16 },
    enemyHitBase: 0.6,
    enemyHitPerStage: 0.02,
  },
  enemyCrit: {
    base: 0.05,
    perStage: 0.005,
    cap: 0.2,
    dmgBase: 1.5,
    dmgPerStage: 0.02,
    dmgCap: 2.0,
  },
  // Enemy magic = the enemy's MAX ENERGY; regen is the flat combat value.
  enemyMagic: {
    base: 30,
    perStage: 1,
    cap: 60,
    bossBonus: 10,
    startEnergy: 50, // clamped to the enemy's max energy
    skillCost: 25,
    webPenalty: 0.25, // accuracy reduction while webbed (Broodmother)
  },
  shop: {
    bed: { base: 15, perStage: 4 }, // full restore cost = base + perStage * stage
    items: {
      // `effect` is applied by the shared Combat.useItem — a new consumable
      // is a catalog entry only. Supported fields:
      //   heal: 'potion'  — restore stats().potionHeal of max HP (equipment-boosted)
      //   energy: N       — restore a flat N energy
      //   restoreFrac: f  — restore f of max HP and max energy
      potion: { name: 'Potion', desc: 'Heal 35% of max ❤️', priceBase: 25, perStage: 2, effect: { heal: 'potion' } },
      vial: { name: 'Vial', desc: 'Restore 50 ⭐', priceBase: 35, perStage: 2, effect: { energy: 50 } },
      elixir: { name: 'Elixir', desc: 'Restore 75% of max ❤️ and ⭐', priceBase: 70, perStage: 3, effect: { restoreFrac: 0.75 } },
    },
  },
};
