export const MAX_SKILLS = 4;

// Skill catalog. Each entry is data only: the combat engine interprets the
// effect fields, and progression decides when skills become learnable.
//
// `pool: [minLevel, maxLevel]` — the level range in which this skill can be
// randomly learned on level-up. Skills with no pool are not learnable
// (starter only). `starter: true` skills begin equipped.
//
// Damage tiers are balanced around 10-stage blocks: a tier-N attack kills
// block-N enemies (stages 10N-9 .. 10N) in ~4 turns. Skill tiers follow
// the PLAYER instead (the campaign tops out at ~level 25), so each tier
// is learnable in its 5-level block:
//   T1 Keen 1.25 -> levels 1-5    (cost 15)
//   T2 Mighty 1.5 -> levels 6-10   (cost 25)
//   T3 Brutal 1.75 -> levels 11-15  (cost 35)
//   T4 Crushing 2.0 -> levels 16-20 (cost 45)
//   T5 Cataclysmic 2.25 -> levels 21-25 (cost 55)
//
// Energy is the only gate: costs are set so cadence comes from the Magic
// stat (energy regen per turn).
export const TIER_MULTS = [1.25, 1.5, 1.75, 2.0, 2.25];
export const TIER_NAMES = ['Keen', 'Mighty', 'Brutal', 'Crushing', 'Cataclysmic'];
export const TIER_BLOCKS = [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25]];
export const TIER_COSTS = [15, 25, 35, 45, 55];

export const SKILLS = [
  {
    id: 'powerstrike',
    name: 'Power Strike',
    desc: 'A Mighty ⚔️ attack.',
    cost: 25,
    starter: true,
    weapon: 'blade',
    type: 'damage',
    mult: 1.5,
  },
  // ---- Blade (sword) tier ladder --------------------------------------
  {
    id: 'fairblade',
    name: 'Fair Blade',
    desc: 'A Keen ⚔️ attack.',
    cost: 15,
    pool: [1, 5],
    weapon: 'blade',
    type: 'damage',
    mult: 1.25,
  },
  {
    id: 'cleave',
    name: 'Cleave',
    desc: 'A Brutal ⚔️ attack.',
    cost: 35,
    pool: [11, 15],
    weapon: 'blade',
    type: 'damage',
    mult: 1.75,
  },
  {
    id: 'oathbreaker',
    name: 'Oathbreaker',
    desc: 'A Crushing ⚔️ attack.',
    cost: 45,
    pool: [16, 20],
    weapon: 'blade',
    type: 'damage',
    mult: 2.0,
  },
  {
    id: 'sunderingstroke',
    name: 'Sundering Stroke',
    desc: 'A Cataclysmic ⚔️ attack.',
    cost: 55,
    pool: [21, 25],
    weapon: 'blade',
    type: 'damage',
    mult: 2.25,
  },
  // ---- Blunt tier ladder ----------------------------------------------
  {
    id: 'steadyslow',
    name: 'Steady Blow',
    desc: 'A Keen 🔨 attack.',
    cost: 15,
    pool: [1, 5],
    type: 'damage',
    mult: 1.25,
  },
  {
    id: 'heavyslow',
    name: 'Heavy Blow',
    desc: 'A Mighty 🔨 attack.',
    cost: 25,
    pool: [6, 10],
    type: 'damage',
    mult: 1.5,
  },
  {
    id: 'sageslow',
    name: 'Savage Blow',
    desc: 'A Brutal 🔨 attack.',
    cost: 35,
    pool: [11, 15],
    type: 'damage',
    mult: 1.75,
  },
  {
    id: 'mountainbreaker',
    name: 'Mountain Breaker',
    desc: 'A Crushing 🔨 attack.',
    cost: 45,
    pool: [16, 20],
    type: 'damage',
    mult: 2.0,
  },
  {
    id: 'titancrush',
    name: 'Titan Crush',
    desc: 'A Cataclysmic 🔨 attack.',
    cost: 55,
    pool: [21, 25],
    type: 'damage',
    mult: 2.25,
  },
  // ---- Fire tier ladder -----------------------------------------------
  {
    id: 'embersnap',
    name: 'Ember Snap',
    desc: 'A Keen 🔥 attack.',
    cost: 15,
    pool: [1, 5],
    type: 'damage',
    mult: 1.25,
    element: 'fire',
  },
  {
    id: 'emberjab',
    name: 'Ember Jab',
    desc: 'A Mighty 🔥 attack.',
    cost: 25,
    pool: [6, 10],
    type: 'damage',
    mult: 1.5,
    element: 'fire',
  },
  {
    id: 'hellfireburst',
    name: 'Hellfire Burst',
    desc: 'A Brutal 🔥 attack.',
    cost: 35,
    pool: [11, 15],
    type: 'damage',
    mult: 1.75,
    element: 'fire',
  },
  {
    id: 'conflagration',
    name: 'Conflagration',
    desc: 'A Crushing 🔥 attack.',
    cost: 45,
    pool: [16, 20],
    type: 'damage',
    mult: 2.0,
    element: 'fire',
  },
  {
    id: 'pyroclasm',
    name: 'Pyroclasm',
    desc: 'A Cataclysmic 🔥 attack.',
    cost: 55,
    pool: [21, 25],
    type: 'damage',
    mult: 2.25,
    element: 'fire',
  },
  // ---- Ice tier ladder ------------------------------------------------
  {
    id: 'frostenip',
    name: 'Frost Nip',
    desc: 'A Keen ❄️ attack.',
    cost: 15,
    pool: [1, 5],
    type: 'damage',
    mult: 1.25,
    element: 'ice',
  },
  {
    id: 'frostbrand',
    name: 'Frost Brand',
    desc: 'A Mighty ❄️ attack.',
    cost: 25,
    pool: [6, 10],
    type: 'damage',
    mult: 1.5,
    element: 'ice',
  },
  {
    id: 'glacialcrush',
    name: 'Glacial Crush',
    desc: 'A Brutal ❄️ attack.',
    cost: 35,
    pool: [11, 15],
    type: 'damage',
    mult: 1.75,
    element: 'ice',
  },
  {
    id: 'whiteout',
    name: 'Whiteout',
    desc: 'A Crushing ❄️ attack.',
    cost: 45,
    pool: [16, 20],
    type: 'damage',
    mult: 2.0,
    element: 'ice',
  },
  {
    id: 'permafrost',
    name: 'Permafrost',
    desc: 'A Cataclysmic ❄️ attack.',
    cost: 55,
    pool: [21, 25],
    type: 'damage',
    mult: 2.25,
    element: 'ice',
  },
  // ---- Lightning tier ladder ------------------------------------------
  {
    id: 'staticzap',
    name: 'Static Zap',
    desc: 'A Keen ⚡ attack.',
    cost: 15,
    pool: [1, 5],
    type: 'damage',
    mult: 1.25,
    element: 'lightning',
  },
  {
    id: 'arcbolt',
    name: 'Arc Bolt',
    desc: 'A Mighty ⚡ attack.',
    cost: 25,
    pool: [6, 10],
    type: 'damage',
    mult: 1.5,
    element: 'lightning',
  },
  {
    id: 'thunderclap',
    name: 'Thunderclap',
    desc: 'A Brutal ⚡ attack.',
    cost: 35,
    pool: [11, 15],
    type: 'damage',
    mult: 1.75,
    element: 'lightning',
  },
  {
    id: 'chainlight',
    name: 'Chainlight',
    desc: 'A Crushing ⚡ attack.',
    cost: 45,
    pool: [16, 20],
    type: 'damage',
    mult: 2.0,
    element: 'lightning',
  },
  {
    id: 'stormcall',
    name: 'Stormcall',
    desc: 'A Cataclysmic ⚡ attack.',
    cost: 55,
    pool: [21, 25],
    type: 'damage',
    mult: 2.25,
    element: 'lightning',
  },
  // ---- Utility: early (block 1) ---------------------------------------
  {
    id: 'berserk',
    name: 'Berserk',
    desc: 'Gain +50% damage for 3 turns.',
    cost: 45,
    pool: [6, 10],
    buff: { damage: { bonus: 0.5, turns: 3 } },
  },
  {
    id: 'stone',
    name: 'Stone Skin',
    desc: 'Halve incoming damage for 3 turns.',
    cost: 45,
    pool: [6, 10],
    buff: { defense: { bonus: 0.5, turns: 3 } },
  },
  {
    id: 'minormend',
    name: 'Minor Mend',
    desc: 'Heal 10% of your max ❤️.',
    cost: 15,
    pool: [1, 5],
    healFrac: 0.10,
  },
  {
    id: 'mend',
    name: 'Mend',
    desc: 'Heal 20% of your max ❤️.',
    cost: 25,
    pool: [6, 10],
    healFrac: 0.20,
  },
  {
    id: 'majormend',
    name: 'Major Mend',
    desc: 'Heal 30% of your max ❤️.',
    cost: 35,
    pool: [11, 15],
    healFrac: 0.30,
  },
  {
    id: 'fleshmend',
    name: 'Flesh Mend',
    desc: 'Heal 40% of your max ❤️.',
    cost: 45,
    pool: [16, 20],
    healFrac: 0.40,
  },
  {
    id: 'fullmend',
    name: 'Full Mend',
    desc: 'Heal 50% of your max ❤️.',
    cost: 55,
    pool: [21, 25],
    healFrac: 0.50,
  },
  {
    id: 'aim',
    name: 'Aim',
    desc: 'Gain +20% hit rate for 3 turns.',
    cost: 25,
    pool: [1, 5],
    buff: { hit: { bonus: 0.2, turns: 3 } },
  },
  {
    id: 'focus',
    name: 'Focus',
    desc: 'Your next attack always hits.',
    cost: 15,
    pool: [1, 5],
    guaranteeNext: true,
  },
  {
    id: 'parry',
    name: 'Parry',
    desc: 'Guard, and reflect 25% of incoming damage back at the enemy.',
    cost: 25,
    pool: [1, 5],
    parry: true,
  },
  {
    id: 'meditate',
    name: 'Meditate',
    desc: 'Take double damage this turn, but restore 25% ⭐.',
    cost: 10,
    pool: [1, 5],
    meditate: true,
  },
  // ---- Multi-effect attacks (build tradeoffs, outside the tier ladder) -
  {
    id: 'doublestrike',
    name: 'Double Strike',
    desc: 'Two Keen 🔨 attacks. Each hit can miss and crit.',
    cost: 25,
    pool: [1, 5],
    type: 'damage',
    mult: 1.25,
    hits: 2,
  },
  {
    id: 'poisonedblade',
    name: 'Poisoned Blade',
    desc: 'A Keen 🔨 attack that poisons the enemy (damage over time).',
    cost: 20,
    pool: [1, 5],
    type: 'damage',
    mult: 1.25,
    dot: { amount: 6, turns: 3 },
  },
  {
    id: 'swiftedge',
    name: 'Swift Edge',
    desc: 'A Keen 🔨 attack. If it hits, gain +20% damage for 2 turns.',
    cost: 25,
    pool: [1, 5],
    type: 'damage',
    mult: 1.25,
    buffOnHit: { damage: { bonus: 0.2, turns: 2 } },
  },
  {
    id: 'greedystab',
    name: 'Greedy Stab',
    desc: 'A Keen 🔨 attack. Doubles the gold if it kills.',
    cost: 25,
    pool: [1, 5],
    type: 'damage',
    mult: 1.25,
    killBonus: 'gold',
  },
  {
    id: 'surgicalslice',
    name: 'Surgical Slice',
    desc: 'A Keen 🔨 attack. Doubles the XP if it kills.',
    cost: 25,
    pool: [1, 5],
    type: 'damage',
    mult: 1.25,
    killBonus: 'xp',
  },
  {
    id: 'vampirefang',
    name: 'Vampire Fang',
    desc: 'A Keen 🔨 attack; heal for 50% of the damage dealt.',
    cost: 35,
    pool: [6, 10],
    type: 'damage',
    mult: 1.25,
    leech: 0.5,
  },
  {
    id: 'beasthunter',
    name: 'Beasthunter',
    desc: 'A Mighty 🔨 attack, double against beasts.',
    cost: 30,
    pool: [6, 10],
    type: 'damage',
    mult: 1.5,
    vsType: 'beast',
    vsMult: 2,
  },
  {
    id: 'undeadbane',
    name: 'Undead Bane',
    desc: 'A Mighty 🔨 attack, double against undead.',
    cost: 30,
    pool: [6, 10],
    type: 'damage',
    mult: 1.5,
    vsType: 'undead',
    vsMult: 2,
  },
  {
    id: 'riposte',
    name: 'Riposte',
    desc: 'Counter the next incoming attack for the damage you take.',
    cost: 35,
    pool: [6, 10],
    riposte: true,
  },
  {
    id: 'bloodlet',
    name: 'Bloodlet',
    desc: 'Purge negative effects. Costs 10% of your max ❤️.',
    cost: 0,
    pool: [6, 10],
    hpCostFrac: 0.1,
    cleanse: true,
  },
  {
    id: 'reckless',
    name: 'Reckless Strike',
    desc: 'A Brutal 🔨 attack, but you lose 20% of your max ❤️.',
    cost: 0,
    pool: [11, 15],
    type: 'damage',
    mult: 1.75,
    hpCostFrac: 0.2,
  },
  {
    id: 'giantswing',
    name: "Giant's Swing",
    desc: 'Charge your ⚔️. Your next attack becomes Brutal.',
    cost: 40,
    pool: [11, 15],
    chargeMult: 1.75,
  },
  {
    id: 'trueedge',
    name: 'True Edge',
    desc: 'A Keen 🔨 attack, ignoring armor.',
    cost: 30,
    pool: [20, 999],
    type: 'damage',
    mult: 1.25,
    ignoreArmor: true,
  },
  {
    id: 'opportune',
    name: 'Opportune Moment',
    desc: 'A Keen 🔨 attack. If it hits, you act again.',
    cost: 45,
    pool: [16, 20],
    type: 'damage',
    mult: 1.25,
    extraActionOnHit: true,
  },
  {
    id: 'volley',
    name: 'Volley',
    desc: 'Three Keen 🔨 attacks. Each hit can miss and crit.',
    cost: 40,
    pool: [16, 20],
    type: 'damage',
    mult: 1.25,
    hits: 3,
  },
  {
    id: 'adrenaline',
    name: 'Adrenaline',
    desc: 'Gain +35% damage and +35% hit rate for 2 turns.',
    cost: 45,
    pool: [20, 999],
    buff: {
      damage: { bonus: 0.35, turns: 2 },
      hit: { bonus: 0.35, turns: 2 },
    },
  },
  {
    id: 'secondwind',
    name: 'Second Wind',
    desc: 'Heal 20% of your max ❤️ and purge all negative effects.',
    cost: 35,
    pool: [20, 999],
    healFrac: 0.2,
    cleanse: true,
  },
];

export const SKILL_MAP = Object.fromEntries(SKILLS.map((s) => [s.id, s]));

// Enemy skills (names/desc only — effects live in combat.js; costs come from
// TUNING.enemyMagic.skillCost). Used by the bestiary and intent labels.
// Enemy skills: the same declarative effect fields as player skills
// (buff/dot/web/defenseDown/damage + element), applied by the shared
// Combat.castSkill path — no per-skill code branches.
// `log` is optional enemy-flavor text for the cast line.
export const ENEMY_SKILLS = {
  enrage: { id: 'enrage', name: 'Enrage', desc: 'Gain +40% damage for 3 turns.', buff: { damage: { bonus: 0.4, turns: 3 } }, log: 'enrages (+40% damage)!' },
  shell: { id: 'shell', name: 'Shell', desc: 'Halve incoming damage for 3 turns.', buff: { defense: { bonus: 0.5, turns: 3 } }, log: 'hardens its shell' },
  venom: { id: 'venom', name: 'Venom', desc: 'Poison the hero (5 damage/turn for 3 turns).', dot: { amount: 5, turns: 3 } },
  toxins: { id: 'toxins', name: 'Brood Toxin', desc: 'Poison the hero (5 damage/turn for 5 turns).', dot: { amount: 5, turns: 5 }, log: 'drenches you in toxic venom!' },
  web: { id: 'web', name: 'Web Spray', desc: 'Reduce the hero’s accuracy for 3 turns.', web: { turns: 3 } },
  // Loot Goblin.
  flee: { id: 'flee', name: 'Flee', desc: 'Runs off the turn after the hero strikes twice.' },
  crystallineshell: { id: 'crystallineshell', name: 'Crystalline Shell', desc: 'Gain defense for 5 turns.', buff: { defense: { bonus: 0.5, turns: 5 } }, log: 'hardens into a crystalline shell (5 turns of defense)' },
  crystaldrain: { id: 'crystaldrain', name: 'Crystal Lance', desc: 'Lance the hero’s energy bar (drains ⭐).', drainEnergy: true },
  // Boss: The Lich (stage 30).
  frostbolt: { id: 'frostbolt', name: 'Frost Bolt', desc: 'A ❄️ spell dealing 150% damage.', type: 'damage', mult: 1.5, element: 'ice' },
  chainlightning: { id: 'chainlightning', name: 'Chain Lightning', desc: 'A ⚡ spell dealing 150% damage.', type: 'damage', mult: 1.5, element: 'lightning' },
  wither: { id: 'wither', name: "Lich's Wither", desc: "Lowers the hero's defense for 5 turns.", defenseDown: { bonus: 0.5, turns: 5 }, log: `casts Lich's Wither — your defense crumbles (5 turns)!` },
  // Boss: The Ember Wyrm (stage 40).
  infernobolt: { id: 'infernobolt', name: 'Inferno Bolt', desc: 'A 🔥 spell dealing 150% damage (15% chance to set Burning).', type: 'damage', mult: 1.5, element: 'fire' },
  fury: { id: 'fury', name: 'Dragon Fury', desc: 'Gain 40% more attack for 5 turns.', buff: { damage: { bonus: 0.4, turns: 5 } }, log: 'rages — +40% attack for 5 turns!' },
};

// Skills learnable at a given player level (randomized pool per level range).
export function poolFor(level) {
  return SKILLS.filter((s) => s.pool && level >= s.pool[0] && level <= s.pool[1]);
}

// The damage line a skill belongs to: its element, or blade/blunt for
// weapon skills. Utility (buff/heal) skills have no line and never
// block or get blocked.
export function skillLine(s) {
  if (s.element) return s.element;
  if (s.weapon === 'blade') return 'blade';
  if (s.type === 'damage') return 'blunt';
  return null;
}

// A damage skill that is plain single-hit damage only - no extra effect
// fields (multi-hit, poison, lifesteal, type bonus, armor pierce, on-hit
// buffs, kill bonuses, charges, HP costs, ...). Only these take part in
// tier suppression: multi-effect skills are build tradeoffs, so they are
// never hidden by tier ownership, and they never suppress other tiers.
export function isPlainDamage(s) {
  if (s.type !== 'damage') return false;
  const plain = ['id', 'name', 'desc', 'cost', 'pool', 'starter', 'type', 'mult', 'element', 'weapon'];
  return Object.keys(s).every((k) => plain.includes(k));
}

// The damage-line candidates for a level-up: not owned, payable at
// `energy`, and - for plain single-hit damage skills only - not below a
// higher-tier skill of the same line that the player already owns.
export function candidatesFor(level, ownedIds, energy = Infinity) {
  const ownedSkills = ownedIds.map((id) => SKILL_MAP[id]).filter(Boolean);
  return poolFor(level).filter((s) => {
    if (ownedIds.includes(s.id)) return false;
    if (s.cost > energy) return false;
    const line = skillLine(s);
    if (!line || !isPlainDamage(s)) return true; // utility / multi-effect: always offered
    return !ownedSkills.some(
      (o) => isPlainDamage(o) && skillLine(o) === line && o.mult > s.mult,
    );
  });
}

// A random learnable skill the player does not already own, or null.
// `energy` excludes skills you cannot currently use (cost > energy);
// owning a higher-tier plain skill of a line hides the lower plain tiers
// of that line (e.g. a Cataclysmic fire spell hides weaker fire spells).
// Multi-effect skills (Double Strike, Vampire Fang, Beasthunter, ...)
// never block and are never blocked.
// Pick up to `count` DISTINCT learnable skills for a level-up, so the
// player chooses one. Candidates are within the level block, payable from
// the energy pool, not owned, and not a plain single-hit skill of a tier
// the player already has in any form.
export function pickSkillChoices(level, ownedIds, energy = Infinity, count = 3, rng = Math.random) {
  const bag = [...candidatesFor(level, ownedIds, energy)];
  const choices = [];
  while (choices.length < count && bag.length) {
    const i = Math.min(bag.length - 1, Math.floor(rng() * bag.length));
    choices.push(bag.splice(i, 1)[0]);
  }
  return choices;
}
