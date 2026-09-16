// Node smoke tests for the game modules (no DOM required).
import assert from 'node:assert/strict';

// Minimal localStorage shim for Node.
if (typeof globalThis.localStorage === 'undefined') {
  const mem = {};
  globalThis.localStorage = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
    clear: () => { for (const k in mem) delete mem[k]; },
  };
}
import { Player } from '../js/game/player.js';
import { Progression } from '../js/game/progression.js';
import { createEnemy, isBossStage, poolForStage, elementMultFor } from '../js/content/enemies.js';
import { Combat } from '../js/game/combat.js';
import { EventBus } from '../js/core/events.js';
import { SaveStore, DEFAULT_SAVE } from '../js/core/save.js';
import { TUNING } from '../js/content/tuning.js';
import { pickSkillChoices, poolFor, skillLine, candidatesFor, isPlainDamage, TIER_BLOCKS, TIER_COSTS, TIER_MULTS, SKILLS } from '../js/content/skills.js';
import { xpForNext } from '../js/game/upgrades.js';
import { EQUIPMENT, pieceName, nextTier } from '../js/game/equipment.js';

// Keep the Loot Goblin spawn out of every test except its own.
TUNING.spawn.lootGoblinChance = 0;

// Deterministic RNG: a 32-bit xorshift seeded by the caller.
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function newPlayer(seed = 42) {
  return new Player({ rng: makeRng(seed) });
}

function newSave() {
  return { ...DEFAULT_SAVE(), player: {}, stage: 1 };
}

// --- Player: stored stats, random level-up growth, skills, items ------------
{
  const p = newPlayer();
  const s = p.stats();
  assert.equal(s.attack, 16, 'base attack');
  assert.equal(s.defense, 0, 'base defense');
  assert.equal(s.magic, 25, 'base magic');
  assert.equal(s.maxEnergy, 25, 'max energy = magic');
  assert.equal(p.skills.length, 1, 'starts with Power Strike');
  assert.equal(p.skills[0], 'powerstrike');

  const before = p.stats();
  for (let i = 0; i < 10; i++) p.addXp(1000); // force ~10 levels
  const after = p.stats();
  assert.ok(p.level >= 9, `10k xp should reach high level (got ${p.level})`);
  assert.ok(after.attack >= before.attack, 'attack grows on level-up');
  assert.ok(after.maxHp >= before.maxHp, 'maxHp grows on level-up');
  assert.ok(after.magic >= before.magic, 'magic grows on level-up');
  const g = p._lastLevelUp;
  for (const k of ['attack', 'defense']) {
    assert.ok(g[k] >= 0 && g[k] <= 2, `per-level ${k} gain in [0,2] (got ${g[k]})`);
  }
  assert.ok(g.magic >= 2 && g.magic <= 4, `per-level magic gain in [2,4] (got ${g.magic})`);
  assert.ok(g.maxHp >= 12 && g.maxHp <= 28, `per-level maxHp gain in [12,28] (got ${g.maxHp})`);
}

// --- Skill pools: max 4, learn/replace, level ranges ------------------------
{
  const p = newPlayer();
  const r1 = p.learnSkill('berserk');
  assert.equal(r1.learned, true, 'auto-learn when room');
  assert.equal(p.skills.length, 2);
  const dup = p.learnSkill('berserk');
  assert.equal(dup.already, true, 'no duplicate skills');

  // Fill to 4, then the next learn must request replacement.
  for (const id of ['stone', 'aim']) p.learnSkill(id);
  assert.equal(p.skills.length, 4);
  const full = p.learnSkill('mend');
  assert.equal(full.needsReplace, true, 'replace prompt at 4 skills');
  assert.equal(p.skills.length, 4, 'not auto-added when full');
  assert.equal(p.replaceSkill('aim', 'mend'), true, 'replace works');
  assert.ok(p.skills.includes('mend') && !p.skills.includes('aim'));

  // Pool randomization by level range (pools are 5-level blocks; the
  // campaign tops out at ~level 25, so all five tiers fit in 1-25).
  assert.ok(poolFor(3).some((s) => s.pool[0] <= 3 && s.pool[1] >= 3), 'block-1 pool non-empty at lv3');
  assert.ok(!poolFor(3).some((s) => s.pool[0] > 3), 'no block-2+ skills at lv3');
  assert.ok(poolFor(15).some((s) => s.pool[0] >= 11), 'block-3 skills present at lv15');
  // Tier skills are learnable in their own 5-level block and nowhere else.
  for (const sk of SKILLS.filter((k) => k.pool && k.cost >= 15 && k.cost <= 55 && isPlainDamage(k))) {
    const block = TIER_BLOCKS[TIER_COSTS.indexOf(sk.cost)];
    assert.deepEqual(sk.pool, block, `${sk.id} pool matches its tier block ${JSON.stringify(block)}`);
  }
  // Early pool carries the Keen (tier 1) element basics and cheap utility.
  const earlyIds = poolFor(3).map((s) => s.id);
  assert.ok(earlyIds.includes('minormend'), 'early pool has the cheap heal (Minor Mend)');
  assert.ok(earlyIds.includes('swiftedge'), 'early pool has the on-hit skill (Swift Edge)');
  assert.ok(earlyIds.includes('embersnap') && earlyIds.includes('frostenip') && earlyIds.includes('staticzap'),
    'early pool has the tier-1 element basics');
  // Late pool (20+) is populated: late utilities + the Cataclysmic tier
  // (which must be reachable by ~level 25, the campaign's end).
  const lateIds = poolFor(25).map((s) => s.id);
  for (const id of ['trueedge', 'adrenaline', 'secondwind', 'pyroclasm']) {
    assert.ok(lateIds.includes(id), `late pool has ${id} at lv25`);
  }
  for (let i = 0; i < 50; i++) {
    const pick = pickSkillChoices(15, [], Infinity, 1, makeRng(i))[0];
    assert.ok(pick.pool[0] <= 15 && pick.pool[1] >= 15, 'pick matches level range');
  }
  // Offers respect the energy pool: nothing unpayable.
  for (let i = 0; i < 50; i++) {
    for (const pick of pickSkillChoices(3, [], 25, 3, makeRng(i)))
      assert.ok(pick.cost <= 25, `level-up pick payable in a 25 pool (${pick.id} costs ${pick.cost})`);
  }
  // Owning a higher-tier skill hides the lower tiers of that line.
  for (let i = 0; i < 50; i++) {
    for (const pick of pickSkillChoices(3, ['powerstrike'], Infinity, 3, makeRng(i)))
      assert.ok(
        !(skillLine(pick) === 'blade' && pick.mult < 1.5),
        `no lower blade tier under Power Strike (got ${pick.id})`,
      );
  }
  // Multi-effect skills are never suppressed: Double Strike stays offered
  // under a higher blade tier, plain lower blade tiers stay suppressed.
  const underBlade = candidatesFor(5, ['powerstrike'], Infinity).map((s) => s.id);
  assert.ok(underBlade.includes('doublestrike'), 'Double Strike offered despite higher blade tier owned');
  assert.ok(underBlade.includes('poisonedblade'), 'Poisoned Blade offered despite higher blade tier owned');
  for (const blocked of ['fairblade'])
    assert.ok(!underBlade.includes(blocked), `${blocked} still suppressed under Power Strike`);
  // A multi-effect owner (Beasthunter, 150% + type bonus) suppresses
  // nothing: line skills stay offered in their own pool windows.
  const underType5 = candidatesFor(5, ['beasthunter'], Infinity).map((s) => s.id);
  assert.ok(underType5.includes('doublestrike'), 'multi-effect owner does not hide Double Strike');
  const underType15 = candidatesFor(15, ['beasthunter'], Infinity).map((s) => s.id);
  assert.ok(underType15.includes('cleave'), 'multi-effect owner does not hide Cleave');
  // A plain Cataclysmic owner suppresses plain lower tiers of its line.
  const underSunder = candidatesFor(5, ['sunderingstroke'], Infinity).map((s) => s.id);
  for (const blocked of ['fairblade'])
    assert.ok(!underSunder.includes(blocked), `${blocked} suppressed under Sundering Stroke`);
  for (let i = 0; i < 50; i++) {
    for (const pick of pickSkillChoices(3, ['emberjab'], Infinity, 3, makeRng(i)))
      assert.ok(
        !(pick.element === 'fire' && pick.mult < 1.5),
        `no weaker fire under Ember Jab (got ${pick.id})`,
      );
  }
  // Level-up offers are distinct and always drawn from the candidate pool.
  const choices = pickSkillChoices(15, ['powerstrike'], 55, 3, makeRng(9));
  assert.ok(choices.length >= 2 && choices.length <= 3, 'up to 3 distinct choices');
  assert.equal(new Set(choices.map((s) => s.id)).size, choices.length, 'choices are distinct');
  const cand = candidatesFor(15, ['powerstrike'], 55).map((s) => s.id);
  for (const c of choices) assert.ok(cand.includes(c.id), `choice ${c.id} is a valid candidate`);
}

// --- Items: single-use, shop prices -----------------------------------------
{
  const p = newPlayer();
  p.addItem('vial', 2);
  assert.equal(p.items.vial, 2);
  assert.equal(p.removeItem('vial'), true);
  assert.equal(p.removeItem('vial'), true);
  assert.equal(p.removeItem('vial'), false, 'cannot go negative');
  const price = TUNING.shop.items.potion.priceBase + TUNING.shop.items.potion.perStage * 5;
  assert.equal(price, 25 + 10, 'potion price scales with stage');
}

// --- Enemy scaling: HP, atk, armor, magic ----------------------------------
{
  const e1 = createEnemy(1);
  const e10 = createEnemy(10);
  assert.ok(e10.maxHp > e1.maxHp, 'enemy HP scales with stage');
  assert.ok(e10.atk > e1.atk, 'enemy atk scales with stage');
  assert.equal(e10.armor, 2, 'armor every 4 stages');
  assert.equal(isBossStage(10), true);
  assert.equal(isBossStage(11), false);
  const e50 = createEnemy(50);
  assert.equal(e50.id, 'umbra', 'stage 50 is the final boss');
  assert.ok(e50.magic >= e10.magic, 'enemy magic scales with stage');
}

// --- Full tier ladder: exactly 5 tiers, every weapon carries each ------
{
  const TIERS = {
    keen: 1.25,
    mighty: 1.5,
    brutal: 1.75,
    crushing: 2.0,
    cataclysmic: 2.25,
  };
  const weapons = ['blade', 'blunt', 'fire', 'ice', 'lightning'];
  for (const w of weapons) {
    for (const [tier, mult] of Object.entries(TIERS)) {
      const has = SKILLS.some((s) =>
        s.type === 'damage' &&
        s.mult === mult &&
        (w === 'blade'
          ? s.weapon === 'blade'
          : w === 'blunt'
            ? !s.element && s.weapon !== 'blade'
            : s.element === w));
      assert.ok(has, `${w} has a ${tier} (${mult}x) skill`);
    }
  }
  // No damage skill sits outside the 5-tier ladder (multi-hit skills
  // reuse tier multipliers per hit).
  for (const s of SKILLS) {
    if (s.type !== 'damage') continue;
    assert.ok(TIER_MULTS.includes(s.mult), `${s.id} sits on the tier ladder (${s.mult})`);
  }
  // Every learnable skill is payable when it enters the pool: magic
  // grows 2-4 per level from 25, so max magic at pool start >= cost.
  for (const s of SKILLS.filter((k) => k.pool)) {
    const maxMagicAtStart = 25 + 4 * (s.pool[0] - 1);
    assert.ok(
      s.cost === 0 || maxMagicAtStart >= s.cost,
      `${s.id} payable at pool start (cost ${s.cost}, max magic ${maxMagicAtStart})`,
    );
  }
}

// --- Stage pools: limited per-stage pools + biome bosses -------------------
{
  const pool1 = poolForStage(1);
  assert.deepEqual(pool1, ['stinger', 'skeleton', 'slime'], 'stage-1 pool is spider/skeleton/slime');
  const seen = new Set();
  for (let i = 0; i < 30; i++) seen.add(createEnemy(1).id);
  for (const id of seen) assert.ok(pool1.includes(id), `stage-1 only spawns pool enemies (got ${id})`);
  // Pools differ per biome.
  assert.deepEqual(poolForStage(11), ['warden', 'slime', 'grunt'], 'cavern pool');
  assert.deepEqual(poolForStage(41), ['brute', 'skeleton', 'wyvern'], 'dark castle pool');
  // The stage-10 boss is the Broodmother with web + 5-turn toxin + bite.
  const bm = createEnemy(10);
  assert.equal(bm.id, 'broodmother', 'stage 10 boss is the Broodmother');
  assert.deepEqual(bm.skills.sort(), ['toxins', 'web']);
  assert.equal(bm.boss, true);
  // The stage-20 boss is the Crystal Guardian: shell (5 turns) + energy drain.
  const cg = createEnemy(20);
  assert.equal(cg.id, 'crystalguardian', 'stage 20 boss is the Crystal Guardian');
  assert.deepEqual(cg.skills.sort(), ['crystaldrain', 'crystallineshell']);
  assert.equal(cg.boss, true);
  // The stage-30 boss is the Lich: ice + lightning spells + defense debuff.
  const lich = createEnemy(30);
  assert.equal(lich.id, 'lich', 'stage 30 boss is the Lich');
  assert.deepEqual(lich.skills.sort(), ['chainlightning', 'frostbolt', 'wither']);
  assert.equal(lich.boss, true);
  // The stage-40 boss is the Ember Wyrm: fire spell + 5-turn attack buff.
  const wyrm = createEnemy(40);
  assert.equal(wyrm.id, 'emberwyrm', 'stage 40 boss is the Ember Wyrm');
  assert.deepEqual(wyrm.skills.sort(), ['fury', 'infernobolt']);
  assert.equal(wyrm.boss, true);
}

// --- Crystal Guardian: 5-turn shell + energy-bar lance --------------------
async function testCrystalGuardian() {
  TUNING.combat.enemyActionDelayMs = 0;
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const p = new Player({ level: 10 });
  p.stats0.magic = 100;
  const boss = createEnemy(20);
  const cb = new Combat(p, boss, new EventBus());
  cb.start();
  // Crystal Lance drains the player's energy for the boss's stage-scaled
  // attack value - the same strength as its normal attack (energy only).
  const energyBefore = cb.p.energy;
  const hpBefore = cb.p.hp;
  cb.enemySkill('crystaldrain');
  assert.equal(energyBefore - cb.p.energy, boss.atk, 'drain equals the boss atk (stage-scaled)');
  assert.equal(cb.p.hp, hpBefore, 'drain touches the energy bar only');
  // Crystalline Shell grants 5 turns of defense (skill cost is paid in
  // enemyTurn for 'skill' intents; mirror it since we call directly).
  cb.e.energy -= TUNING.enemyMagic.skillCost;
  cb.enemySkill('crystallineshell');
  assert.equal(cb.e.buffs.defense.turns, 5, 'shell lasts 5 turns');
  assert.equal(cb.e.buffs.defense.bonus, 0.5, 'shell halves damage');
  cb.e.energy -= TUNING.enemyMagic.skillCost;
  assert.equal(cb.e.energy, 50 - 2 * TUNING.enemyMagic.skillCost, 'both skills cost enemy energy');
}

// --- Lich + Ember Wyrm: boss spells, defense debuff, 5-turn fury --------
async function testBossSkills() {
  TUNING.combat.enemyActionDelayMs = 0;
  const prevVariance = TUNING.combat.damageVariance;
  TUNING.combat.damageVariance = 0; // deterministic spell math
  // Pin Math.random so enemy skills never roll a miss/crit:
  // chance(p) = (0.99 < p) is false for every p < 0.99.
  const realRandom = Math.random;
  Math.random = () => 0.99;
  const unpinned = () => {
    Math.random = realRandom;
  };
  const cast = (cb, id) => {
    Math.random = () => 0.99;
    cb.enemySkill(id);
    unpinned();
  };

  // The Lich (stage 30): ice + lightning spells at 150%, Wither halves
  // the hero's defense for 5 turns.
  const p = new Player({ level: 10 });
  p.stats0.magic = 100;
  p.stats0.defense = 8;
  const lich = createEnemy(30);
  const cb = new Combat(p, lich, new EventBus());
  cb.start();
  cb.enemy.critChance = 0;
  const atk = lich.atk;
  const hit150 = Math.max(1, Math.round(atk * 1.5));

  const hpBefore = cb.p.hp;
  cb.p.hp = 1000; // headroom so damage isn't clamped at 0
  cast(cb, 'frostbolt');
  const frostDmg = 1000 - cb.p.hp;
  assert.equal(frostDmg, Math.max(1, hit150 - 8), 'Frost Bolt = 150% atk minus full defense');

  cast(cb, 'wither');
  assert.equal(cb.p.buffs.defenseDown.turns, 5, 'Wither lasts 5 turns');
  assert.equal(cb.p.buffs.defenseDown.bonus, 0.5, 'Wither halves defense');

  // With Wither active, Chain Lightning lands against the halved defense.
  cb.p.hp = 1000;
  cast(cb, 'chainlightning');
  assert.equal(1000 - cb.p.hp, Math.max(1, hit150 - 4), 'Chain Lightning respects the halved defense');

  // The Ember Wyrm (stage 40): fire spell + Dragon Fury (+40% atk, 5 turns).
  const p2 = new Player({ level: 30 });
  p2.stats0.magic = 100;
  p2.stats0.defense = 0;
  const wyrm = createEnemy(40);
  const c2 = new Combat(p2, wyrm, new EventBus());
  c2.start();
  c2.enemy.critChance = 0;
  const atk2 = wyrm.atk;

  c2.p.hp = 1000;
  cast(c2, 'infernobolt');
  assert.equal(1000 - c2.p.hp, Math.max(1, Math.round(atk2 * 1.5)), 'Inferno Bolt = 150% of stage-scaled atk');

  cast(c2, 'fury');
  assert.equal(c2.e.buffs.damage.turns, 5, 'Dragon Fury lasts 5 turns');
  assert.equal(c2.e.buffs.damage.bonus, 0.4, 'Dragon Fury grants +40% attack');

  // Fury strengthens the next fire spell.
  c2.p.hp = 1000;
  cast(c2, 'infernobolt');
  assert.equal(1000 - c2.p.hp, Math.max(1, Math.round(atk2 * 1.5 * 1.4)), 'Fury strengthens Inferno Bolt');

  unpinned();
  TUNING.combat.damageVariance = prevVariance;
}

// --- Loot Goblin: 10% replacement, waits, flees after being attacked ----
async function testLootGoblin() {
  TUNING.combat.enemyActionDelayMs = 0;
  const tick = () => new Promise((r) => setTimeout(r, 20));

  // Spawn: chance 1 always replaces non-boss stages; boss stages are safe.
  TUNING.spawn.lootGoblinChance = 1;
  assert.equal(createEnemy(1).id, 'lootgoblin', 'goblin replaces a non-boss stage');
  assert.equal(createEnemy(11).id, 'lootgoblin', 'goblin can appear in any biome');
  assert.equal(createEnemy(10).id, 'broodmother', 'boss stages never become goblins');
  TUNING.spawn.lootGoblinChance = 0;

  // It waits and never attacks; attacking it provokes the flee.
  const p = newPlayer(7);
  p.stats0.magic = 100;
  const g = createEnemy(1);
  TUNING.spawn.lootGoblinChance = 1;
  const gb = createEnemy(2);
  TUNING.spawn.lootGoblinChance = 0;
  assert.equal(gb.id, 'lootgoblin');
  const bus = new EventBus();
  const phases = [];
  bus.on('phase', (d) => phases.push(d));
  const c = new Combat(p, gb, bus);
  c.start();
  assert.equal(c.e.flee, true, 'combat flags the passive flee enemy');

  c.act('guard');
  await tick();
  assert.equal(c.done, false, 'battle continues while the goblin waits');
  assert.equal(c.e.intent, 'wait', 'goblin intent is wait');
  assert.equal(c.p.hp, c.p.maxHp, 'the goblin never attacks');

  c.p.guarantee = true;
  c.act('attack');
  assert.equal(c.e.provoked, true, 'attacking provokes the goblin');
  assert.equal(c.e.fleeCountdown, 1, 'provoked goblin counts one enemy turn');
  await tick(); // enemy turn 1: it holds, giving the hero a second hit chance
  assert.equal(c.done, false, 'goblin still there after the first enemy turn');
  assert.equal(c.e.fleeCountdown, 0, 'flee countdown reached zero');
  assert.equal(c.p.hp, c.p.maxHp, 'goblin never attacks, even while provoked');
  // Second player turn: the hero can strike again.
  c.act('attack');
  assert.equal(c.done, false, 'second hit does not instantly end the fight');
  await tick(); // enemy turn 2: now it runs off
  assert.equal(c.e.intent, 'flee', 'provoked goblin rolls flee');
  assert.equal(c.done, true, 'goblin flees on the second enemy turn');
  const win = phases.find((d) => d.value === 'victory');
  assert.ok(win, 'flee ends the stage as a victory');
  assert.equal(win.fled, true, 'fled flag is set');

  // Kill it in time: a normal victory (no fled flag).
  const p2 = newPlayer(7);
  p2.stats0.magic = 100;
  TUNING.spawn.lootGoblinChance = 1;
  const g2 = createEnemy(3);
  TUNING.spawn.lootGoblinChance = 0;
  const bus2 = new EventBus();
  const phases2 = [];
  bus2.on('phase', (d) => phases2.push(d));
  const c2 = new Combat(p2, g2, bus2);
  c2.start();
  c2.p.guarantee = true;
  c2.e.hp = 1;
  c2.act('attack');
  assert.equal(c2.done, true, 'killed goblin ends the battle');
  const win2 = phases2.find((d) => d.value === 'victory');
  assert.ok(win2, 'kill is a victory');
  assert.equal(win2.fled ?? false, false, 'killed goblin = normal victory (drop applies)');
  assert.equal(c2.e.provoked, false, 'a fatal strike does not provoke (it is dead)');
}

// --- Healing line: one per 10-level block, 10% -> 50% of max HP --------
async function testHealLine() {
  const expected = [
    ['minormend', [1, 5], 15, 0.1],
    ['mend', [6, 10], 25, 0.2],
    ['majormend', [11, 15], 35, 0.3],
    ['fleshmend', [16, 20], 45, 0.4],
    ['fullmend', [21, 25], 55, 0.5],
  ];
  for (const [id, pool, cost, frac] of expected) {
    const sk = SKILLS.find((s) => s.id === id);
    assert.ok(sk, `heal line has ${id}`);
    assert.deepEqual(sk.pool, pool, `${id} lives in its 5-level block`);
    assert.equal(sk.cost, cost, `${id} cost follows the tier ladder`);
    assert.equal(sk.healFrac, frac, `${id} heals ${frac * 100}% of max HP`);
  }

  // Heal actually restores: bottom tier 10%, top tier 50%.
  for (const [id, frac] of [['minormend', 0.1], ['fullmend', 0.5]]) {
    const p = newPlayer(3);
    p.stats0.magic = 200;
    const e = createEnemy(1);
    e.maxHp = 1000; e.hp = 1000;
    const bus = new EventBus();
    const c = new Combat(p, e, bus);
    c.start();
    const maxHp = c.p.maxHp;
    c.p.energy = 200;
    c.p.hp = Math.round(maxHp * 0.25);
    c.act('skill', id);
    assert.equal(c.p.hp, Math.min(maxHp, Math.round(maxHp * 0.25) + Math.round(maxHp * frac)),
      `${id} heals ${frac * 100}% of max HP`);
  }
}

// --- Burning status: 15% chance on any skill, 5% max HP/turn x 3 -------
async function testBurning() {
  TUNING.combat.enemyActionDelayMs = 0;
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const realRandom = Math.random;

  // Forced burn: Math.random() = 0.05 < 0.15 (and hits/crits stay sane).
  const p = newPlayer(7);
  p.stats0.magic = 200;
  p.stats0.critChance = 0;
  const e = createEnemy(1);
  const bus = new EventBus();
  const c = new Combat(p, e, bus);
  c.start();
  Math.random = () => 0.05;
  c.p.energy = 200;
  c.act('skill', 'embersnap'); // fire
  Math.random = realRandom;
  assert.ok(c.e.buffs.burn, 'a fire skill can set the enemy burning (15% chance)');
  assert.equal(c.e.buffs.burn.turns, 3, 'burn lasts 3 turns');
  assert.equal(c.e.buffs.burn.amount, Math.max(1, Math.round(c.e.maxHp * 0.05)), 'burn is 5% of the enemy max HP per turn');

  // Non-fire skills never burn, even inside the 15% window.
  const p2 = newPlayer(7);
  p2.stats0.magic = 200;
  p2.stats0.critChance = 0;
  const e2 = createEnemy(1);
  const c2 = new Combat(p2, e2, new EventBus());
  c2.start();
  Math.random = () => 0.05;
  c2.p.energy = 200;
  c2.act('skill', 'powerstrike');
  Math.random = realRandom;
  assert.equal(c2.e.buffs.burn, null, 'non-fire skills cannot set burning');

  // No burn when the fire skill misses the window.
  const p3 = newPlayer(7);
  p3.stats0.magic = 200;
  p3.stats0.critChance = 0;
  const e3 = createEnemy(1);
  const c3 = new Combat(p3, e3, new EventBus());
  c3.start();
  Math.random = () => 0.99;
  c3.p.energy = 200;
  c3.act('skill', 'embersnap');
  Math.random = realRandom;
  assert.equal(c3.e.buffs.burn, null, 'no burn outside the 15% window');

  // The burn ticks on the enemy turn.
  c.e.hp = c.e.maxHp;
  const hpBefore = c.e.hp;
  c.enemyTurn();
  assert.ok(c.e.hp <= hpBefore - c.e.buffs.burn.amount + 1, 'burn ticks damage on the enemy turn');

  // Only enemy FIRE attacks can set the player burning (15% chance).
  const p4 = newPlayer(7);
  p4.stats0.critChance = 0;
  const e4 = createEnemy(1);
  const c4 = new Combat(p4, e4, new EventBus());
  c4.start();
  c4.p.maxHp = 200;
  c4.p.hp = 500; // headroom so the hit can't kill
  // Inferno Bolt (fire): cast log/sfx, then enemyDamage — variance, miss
  // check (0.5 >= 1-hitChance -> hits), crit (no), then the burn roll
  // (0.05 < 0.15 -> burn).
  const seq = [0.5, 0.5, 0.5, 0.05];
  let ri = 0;
  Math.random = () => seq[Math.min(ri++, seq.length - 1)];
  c4.enemySkill('infernobolt');
  Math.random = realRandom;
  assert.ok(c4.p.buffs.burn, 'an enemy fire spell can set the player burning (15% chance)');
  assert.equal(c4.p.buffs.burn.amount, Math.max(1, Math.round(200 * 0.05)), 'player burn is 5% of the player max HP per turn');

  // A non-fire enemy attack never burns, even inside the 15% window
  // (same hit sequence, no burn roll exists for it).
  const c4b = new Combat(newPlayer(7), createEnemy(1), new EventBus());
  c4b.start();
  c4b.p.hp = 500;
  ri = 0;
  Math.random = () => seq[Math.min(ri++, seq.length - 1)];
  c4b.enemyDamage(1);
  Math.random = realRandom;
  assert.equal(c4b.p.buffs.burn, null, 'non-fire enemy attacks cannot set burning');

  // The player burn ticks on the enemy turn (force the enemy to miss).
  c4.p.buffs.burn = { amount: 10, turns: 3 }; // re-establish the status
  c4.p.hp = 300;
  const phBefore = c4.p.hp;
  Math.random = () => 0.01; // 0.01 < (1 - hitChance): the enemy misses
  c4.enemyTurn();
  Math.random = realRandom;
  assert.equal(c4.p.hp, phBefore - c4.p.buffs.burn.amount, 'player burn ticks damage on the enemy turn');
}

// --- Hero hit rules: never misses unless webbed; flat evasion ---------
async function testHeroHitRules() {
  TUNING.combat.enemyActionDelayMs = 0;
  const prevVariance = TUNING.combat.damageVariance;
  TUNING.combat.damageVariance = 0;
  const realRandom = Math.random;

  // Unwebbed hero never misses, even on a terrible roll.
  const p = newPlayer(1);
  const c = new Combat(p, createEnemy(1), new EventBus());
  c.start();
  c.p.energy = 200;
  Math.random = () => 0.001; // would have been a miss under the old formula
  const hpBefore = c.e.hp;
  c.act('skill', 'cleave');
  Math.random = realRandom;
  assert.ok(hpBefore - c.e.hp > 0, 'unwebbed hero cannot miss');

  // Webbed hero CAN miss (flat 25% accuracy penalty).
  const p2 = newPlayer(1);
  const c2 = new Combat(p2, createEnemy(1), new EventBus());
  c2.start();
  c2.p.energy = 200;
  c2.p.buffs.web = { turns: 1 };
  Math.random = () => 0.05; // 0.05 < (1 - 0.75): webbed hero misses
  const hpBefore2 = c2.e.hp;
  c2.act('skill', 'cleave');
  Math.random = realRandom;
  assert.equal(hpBefore2 - c2.e.hp, 0, 'webbed hero can miss');

  // Evasion is flat: same at level 1 and level 50.
  const low = newPlayer(1);
  const high = new Player({ level: 50 });
  assert.equal(low.stats().evasion, TUNING.player.evasionBase, 'evasion is flat (level 1)');
  assert.equal(high.stats().evasion, TUNING.player.evasionBase, 'evasion does not scale with level');
  TUNING.combat.damageVariance = prevVariance;
}

// --- Element weaknesses: slimes weak to everything, insects to fire -------
async function testElementWeaknesses() {
  TUNING.combat.enemyActionDelayMs = 0;
  const prevVariance = TUNING.combat.damageVariance;
  TUNING.combat.damageVariance = 0;
  const realRandom = Math.random;

  const slime = createEnemy(1, 2); // forest pool index 2
  assert.equal(slime.id, 'slime', 'forest pool index 2 is the Slime');
  assert.equal(elementMultFor(slime, 'fire'), 1.5, 'slime weak to fire (1.5x)');
  assert.equal(elementMultFor(slime, 'ice'), 1.5, 'slime weak to ice (1.5x)');
  assert.equal(elementMultFor(slime, 'lightning'), 1.5, 'slime weak to lightning (1.5x)');

  const stinger = createEnemy(1, 0); // forest pool index 0 (insect)
  assert.equal(stinger.id, 'stinger', 'forest pool index 0 is the Stinger');
  assert.equal(elementMultFor(stinger, 'fire'), 1.5, 'insects weak to fire (1.5x)');
  assert.equal(elementMultFor(stinger, 'lightning'), 0.5, 'insects still resist lightning');

  // A beast without overrides keeps its type affinities (grunt resists ice).
  const grunt = createEnemy(11, 2); // cavern pool index 2
  assert.equal(grunt.id, 'grunt', 'cavern pool index 2 is the Grunt');
  assert.equal(elementMultFor(grunt, 'ice'), 0.5, 'grunts still resist ice');

  // Damage math: Ember Snap (1.25x fire) vs a slime = 1.25 x 1.5 of attack.
  const p = new Player({ level: 10 });
  p.stats0.magic = 100;
  p.stats0.critChance = 0;
  const e = createEnemy(1, 2);
  const c = new Combat(p, e, new EventBus());
  c.start();
  c.p.guarantee = true; // hits land
  c.p.energy = 100;
  Math.random = () => 0.99; // never crits, misses the 15% burn window
  const hpBefore = c.e.hp;
  c.act('skill', 'embersnap');
  Math.random = realRandom;
  const atk = p.stats0.attack;
  assert.equal(hpBefore - c.e.hp, Math.max(1, Math.round(atk * 1.25 * 1.5)), 'fire skill deals 1.5x vs a slime');
  TUNING.combat.damageVariance = prevVariance;
}

// --- Wardens: lightning attacks at the tier of their 10-stage area -----
async function testWardenLightning() {
  TUNING.combat.enemyActionDelayMs = 0;
  const prevVariance = TUNING.combat.damageVariance;
  TUNING.combat.damageVariance = 0;
  const realRandom = Math.random;

  // Stage 15 warden (cavern, tier 2 = 1.5x) and stage 25 (dungeon, 1.75x).
  const w15 = createEnemy(15, 0);
  assert.equal(w15.id, 'warden', 'cavern pool has the Warden');
  assert.equal(w15.attackStyle.mult, 1.5, 'stage-15 Warden strikes at tier 2 (1.5x)');
  const w25 = createEnemy(25, 2);
  assert.equal(w25.id, 'warden', 'dungeon pool has the Warden');
  assert.equal(w25.attackStyle.mult, 1.75, 'stage-25 Warden strikes at tier 3 (1.75x)');
  const grunt = createEnemy(1, 0);
  assert.equal(grunt.attackStyle, null, 'non-styled enemies have no attack style');

  // Damage math: 1.5x the stage-scaled atk (variance off, no defense).
  const p = new Player({ level: 10 });
  p.stats0.magic = 100;
  p.stats0.defense = 0;
  const w = createEnemy(15, 0);
  const c = new Combat(p, w, new EventBus());
  c.start();
  c.enemy.critChance = 0;
  Math.random = () => 0.99; // never miss, never crit
  c.p.hp = 1000;
  c.enemyDamage(1);
  const dealt = 1000 - c.p.hp;
  Math.random = realRandom;
  assert.equal(dealt, Math.max(1, Math.round(w.atk * 1.5)), 'warden lightning = 1.5x stage-scaled atk at stage 15');

  TUNING.combat.damageVariance = prevVariance;
}

// --- Combat: turn order, guard, skill energy/cd, items, victory ------------
async function testCombatBasics() {
  TUNING.combat.enemyActionDelayMs = 0; // timer fires on the next tick
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const p = newPlayer(7);
  p.stats0.magic = 100; // roomy pool so flat regen is observable
  const e = createEnemy(1);
  e.maxHp = 200; e.hp = 200;
  const bus = new EventBus();
  const c = new Combat(p, e, bus);
  c.start();
  assert.equal(c.busy, false);
  assert.ok(c.canAct('attack'));
  assert.equal(c.p.energy, 50, 'fresh battle starts at default 50');
  assert.ok(c.canAct('skill', 'powerstrike'), 'power strike affordable at 50 energy');
  c.p.guarantee = true; // remove miss variance for a deterministic test
  c.act('attack');
  assert.equal(c.busy, true, 'busy while enemy turn is pending');
  await tick(); // enemy turn resolves via its 0ms timer
  assert.equal(c.busy, false, 'back to player after enemy turn');
  assert.ok(c.e.hp < 200, 'attack dealt damage (resolved on enemy turn)');
  // Guard reduces the next hit.
  c.act('guard');
  await tick();
  // Energy regens a flat 10 per turn (magic is the pool cap).
  assert.equal(c.p.energy, 70, `flat energy regen (got ${c.p.energy})`);
  // Skills are gated by energy only.
  c.act('skill', 'powerstrike');
  await tick();
  assert.equal(c.p.energy, 55, 'energy deducted (50 start + 30 regen, -25 cost)');
  c.p.energy = 10;
  assert.ok(!c.canAct('skill', 'powerstrike'), 'insufficient energy gates use');
  c.p.energy = 25;
  assert.ok(c.canAct('skill', 'powerstrike'), 'sufficient energy allows use');
  // Energy carries over between battles (clamped into the pool).
  const c2 = new Combat(p, e, bus, null, 80);
  assert.equal(c2.p.energy, 80, 'carried energy used as battle start');
  const c3 = new Combat(p, e, bus, null, 500);
  assert.equal(c3.p.energy, 100, 'carried energy clamped to max');
  // Items.
  // Consumables are data-driven: every shop item must carry an effect
  // (useItem has no per-item code paths).
  for (const def of Object.values(TUNING.shop.items)) {
    assert.ok(def.effect && Object.keys(def.effect).length > 0,
      `shop item ${def.name} has a declarative effect`);
  }
  c.p.hp = 10;
  c.act('item', 'potion');
  assert.ok(c.p.hp > 10, 'potion heals');
  assert.equal(p.items.potion, 1, 'item consumed from player inventory');
  await tick(); // resolve the potion's enemy turn
  // Elixir restores 75% of max HP and max energy.
  p.items.elixir = 1;
  c.p.items.elixir = 1;
  c.p.maxHp = 100;
  c.p.maxEnergy = 100;
  c.p.hp = 10;
  c.p.energy = 5;
  c.act('item', 'elixir');
  assert.equal(c.p.hp, 85, 'elixir restores 75% max HP');
  assert.equal(c.p.energy, 80, 'elixir restores 75% max energy');
  await tick(); // resolve the elixir's enemy turn
  // Victory path.
  c.e.hp = 1;
  c.p.guarantee = true; // Focus: guaranteed hit, no flaky miss
  c.act('attack');
  assert.equal(c.done, true, 'enemy death ends the fight');
}

// --- Combat: type-specific skills -------------------------------------------
async function testTypeSkills() {
  const p = newPlayer(3);
  p.stats0.magic = 100; // pool large enough for the skill cost
  p.skills = ['beasthunter', 'powerstrike'];
  const beast = createEnemy(1);
  beast.type = 'beast';
  beast.maxHp = 30; beast.hp = 30;
  const c = new Combat(p, beast, new EventBus());
  c.start();
  c.p.guarantee = true; // remove miss variance
  c.act('skill', 'beasthunter');
  assert.ok(c.e.hp < 30, 'beasthunter damages');
  // Undead Bane against a non-undead target uses the base multiplier only.
  const p2 = newPlayer(3);
  p2.stats0.magic = 100;
  p2.skills = ['undeadbane', 'powerstrike'];
  const beast2 = createEnemy(1);
  beast2.type = 'beast';
  beast2.maxHp = 30; beast2.hp = 30;
  const c2 = new Combat(p2, beast2, new EventBus());
  c2.start();
  c2.p.guarantee = true;
  c2.act('skill', 'undeadbane');
  assert.ok(c2.e.hp < 30, 'undeadbane base damage works vs non-undead');
}

// --- Combat: element skills (attack elements vs creature affinities) --------
async function testElementSkills() {
  // Fire is 1.5x vs beasts, 0.5x vs demons.
  const p = newPlayer(3);
  p.stats0.magic = 100;
  p.stats0.critChance = 0; // keep comparisons deterministic (no crits)
  p.skills = ['emberjab', 'powerstrike'];
  const beast = createEnemy(1);
  beast.type = 'beast';
  beast.elementWeakness = null;
  beast.maxHp = 300; beast.hp = 300;
  const c = new Combat(p, beast, new EventBus());
  c.start();
  c.p.guarantee = true;
  c.act('skill', 'emberjab');
  const vsWeak = 300 - c.e.hp;

  const p2 = newPlayer(3);
  p2.stats0.magic = 100;
  p2.stats0.critChance = 0;
  p2.skills = ['emberjab', 'powerstrike'];
  const demon = createEnemy(1);
  demon.type = 'demon';
  demon.elementWeakness = null;
  demon.maxHp = 300; demon.hp = 300;
  const c2 = new Combat(p2, demon, new EventBus());
  c2.start();
  c2.p.guarantee = true;
  c2.act('skill', 'emberjab');
  const vsResist = 300 - c2.e.hp;
  assert.ok(vsWeak > vsResist, `fire weakness vs beast (${vsWeak}) > resistance vs demon (${vsResist})`);

  // Advanced tier is strictly stronger than the basic tier.
  const p3 = newPlayer(3);
  p3.stats0.magic = 100;
  p3.stats0.critChance = 0;
  p3.skills = ['pyroclasm', 'emberjab'];
  const beast3 = createEnemy(1);
  beast3.type = 'beast';
  beast3.elementWeakness = null;
  beast3.maxHp = 300; beast3.hp = 300;
  const c3 = new Combat(p3, beast3, new EventBus());
  c3.start();
  c3.p.guarantee = true;
  c3.p.energy = 100; // Pyroclasm costs 55 (above the 50 battle start)
  c3.act('skill', 'pyroclasm');
  const adv = 300 - c3.e.hp;
  assert.ok(adv > vsWeak, `advanced tier (${adv}) > basic tier (${vsWeak})`);
}

// --- Progression: rewards, skill learning, victory stage -------------------
{
  const p = newPlayer();
  const save = newSave();
  const prog = new Progression(p, save);
  const reward = prog.onStageWon(1);
  assert.ok(reward.gold >= 8, 'gold reward');
  assert.ok(reward.xp >= 12, 'xp reward');
  assert.equal(save.stage, 2, 'stage advances');
  assert.equal(save.stats.kills, 1, 'kill recorded');

  // Level-ups present a choice of up to 3 skills; nothing auto-learns.
  const p2 = newPlayer();
  const save2 = newSave();
  const prog2 = new Progression(p2, save2);
  let offers = 0;
  for (let i = 0; i < 20; i++) {
    const r = prog2.onStageWon(i + 1);
    if (r.offer.length) offers++;
    assert.ok(r.offer.length <= 3, 'at most 3 skill choices per level-up');
  }
  assert.ok(offers >= 3, `level-ups present skill choices across 20 stages (got ${offers})`);
  assert.equal(p2.skills.length, 1, 'no skill auto-learned (the player chooses)');
}

// --- Equipment: tiers, cumulative stats, purchase cap ---------------------
{
  const p = newPlayer();
  const base = p.stats();
  assert.equal(p.equipment.helmet, 0, 'starts with no equipment');

  assert.ok(p.buyEquipmentTier('chest'));
  assert.ok(p.buyEquipmentTier('chest'));
  assert.equal(p.stats().maxHp, base.maxHp + 20 + 25, 'chest tiers are cumulative');

  assert.ok(p.buyEquipmentTier('sword'));
  const s3 = p.stats();
  assert.equal(s3.attack, base.attack + 2, 'sword tier 1 attack');
  assert.equal(s3.critChance, base.critChance + 0.04, 'sword tier 1 crit chance');
  assert.equal(s3.critDamage, base.critDamage + 0.1, 'sword tier 1 crit damage');

  p.buyEquipmentTier('helmet');
  assert.ok(p.stats().potionHeal > TUNING.player.potionHeal, 'helmet boosts item healing');

  const magicBefore = p.stats().magic;
  p.buyEquipmentTier('legs');
  assert.equal(p.stats().magic, magicBefore + 3, 'legs tier 1 magic');
  assert.equal(p.stats().maxEnergy, p.stats().magic, 'max energy = magic (no Deep Lungs)');

  for (let i = 0; i < 6; i++) p.buyEquipmentTier('chest');
  assert.equal(p.equipment.chest, 5, 'equipment caps at tier 5');
  assert.ok(!p.buyEquipmentTier('chest'), 'cannot buy past tier 5');

  const swordPrices = [1, 2, 3, 4, 5].map((t) => EQUIPMENT.sword.pieces[t].price);
  assert.ok(
    swordPrices.every((v, i) => i === 0 || v > swordPrices[i - 1]),
    'sword tier prices increase'
  );

  assert.equal(pieceName('sword', 2), 'Steel Sword');
  assert.equal(nextTier({ helmet: 0 }, 'helmet'), 1);
  assert.equal(nextTier({ helmet: 5 }, 'helmet'), null);

  const data = p.serialize();
  const p2 = new Player(data);
  assert.equal(p2.equipment.chest, 5, 'equipment serialized');
  assert.equal(p2.equipment.sword, 1, 'equipment serialized (sword)');
}

// --- Save v5: round-trip + migration ---------------------------------------
{
  const store = new SaveStore();
  const data = store.load();
  assert.equal(data.version, 5, 'v5 by default');
  assert.equal(data.player.skills[0], 'powerstrike', 'starter skill');
  assert.equal(data.player.equipment.sword, 0, 'default equipment empty');

  // Round-trip keeps equipment.
  const p = newPlayer();
  p.buyEquipmentTier('legs');
  p.buyEquipmentTier('legs');
  p.gold = 77;
  localStorage.setItem('combat-game.save.v5', JSON.stringify({
    version: 5,
    player: p.serialize(),
    stage: 9,
    stats: { wins: 3, losses: 1, kills: 4 },
    victorySeen: false,
  }));
  const rt = store.load();
  assert.equal(rt.version, 5);
  assert.equal(rt.player.equipment.legs, 2, 'round-trip keeps equipment');
  assert.equal(rt.player.gold, 77, 'round-trip keeps gold');
  assert.equal(rt.stage, 9, 'round-trip keeps stage');

  // v4 -> v5 migration: removed skill ids are stripped.
  localStorage.clear();
  localStorage.setItem('combat-game.save.v4', JSON.stringify({
    version: 4,
    player: {
      level: 5, xp: 0, gold: 50, upgrades: [],
      stats: { attack: 20, defense: 4, magic: 40, maxHp: 160, critChance: 0.1, critDamage: 2 },
      skills: ['powerstrike', 'cinderkiss', 'volflick', 'embersnap'],
      items: { potion: 1, vial: 0, elixir: 0 },
      equipment: { helmet: 0, chest: 1, legs: 0, sword: 0 },
      currentHp: null, currentEnergy: null,
    },
    stage: 6,
    stats: { wins: 5, losses: 0, kills: 5 },
    victorySeen: false,
  }));
  const m45 = store.load();
  assert.equal(m45.version, 5);
  assert.ok(!m45.player.skills.includes('cinderkiss'), 'removed skill stripped');
  assert.ok(!m45.player.skills.includes('volflick'), 'removed skill stripped');
  assert.ok(m45.player.skills.includes('embersnap'), 'kept skill survives migration');
  assert.equal(m45.player.equipment.chest, 1, 'equipment preserved on v4->v5');

  // v3 -> v4 migration: text upgrades become equipment tiers.
  localStorage.clear();
  localStorage.setItem('combat-game.save.v3', JSON.stringify({
    version: 3,
    player: {
      level: 7, xp: 0, gold: 120, upgrades: ['iron', 'iron', 'mana', 'lung', 'sharp'],
      stats: { attack: 18, defense: 6, magic: 40, maxHp: 140, critChance: 0.1, critDamage: 2 },
      skills: ['powerstrike', 'berserk'],
      items: { potion: 2, vial: 1, elixir: 0 },
      currentHp: null, currentEnergy: null,
    },
    stage: 8,
    stats: { wins: 7, losses: 0, kills: 8 },
    victorySeen: false,
  }));
  const m34 = store.load();
  assert.equal(m34.version, 5);
  assert.equal(m34.player.equipment.chest, 2, 'iron x2 -> chest tier 2');
  assert.equal(m34.player.equipment.legs, 1, 'mana x1 -> legs tier 1 (lung dropped)');
  assert.equal(m34.player.equipment.sword, 1, 'sharp x1 -> sword tier 1');
  assert.equal(m34.player.level, 7, 'level preserved');
  assert.equal(m34.stage, 8, 'stage preserved');

  // v2 -> v4 migration: level-derived stats, upgrades -> equipment.
  localStorage.clear();
  localStorage.setItem('combat-game.save.v2', JSON.stringify({
    version: 2,
    player: { level: 5, xp: 0, gold: 40, upgrades: ['sharp'], skills: ['berserk'] },
    stage: 6,
    stats: { wins: 5, losses: 1, kills: 6 },
  }));
  const migrated = store.load();
  assert.equal(migrated.version, 5);
  assert.equal(migrated.player.level, 5);
  assert.equal(migrated.player.stats.attack, 12 + 4 * 2, 'v2 attack recomputed (no upgrade bake-in)');
  assert.equal(migrated.player.stats.magic, 25 + 4 * 3, 'v2 magic re-scaled to max-energy');
  assert.equal(migrated.player.equipment.sword, 1, 'v2 sharp -> sword tier 1');
  assert.ok(migrated.player.skills.includes('powerstrike'));
  assert.ok(migrated.player.skills.includes('berserk'), 'v2 skill carried over');
  assert.equal(migrated.player.items.potion, 2, 'default items on migration');
  localStorage.clear();
}

// --- Balance: clean campaign run reaches the final stage --------------------
{
  // XP per stage is fixed, so the level at stage 50 is deterministic.
  let xp = 0;
  for (let stage = 1; stage < TUNING.stage.victoryStage; stage++) {
    xp += TUNING.rewards.xpBase + TUNING.rewards.xpPerStage * stage +
      (isBossStage(stage) ? TUNING.rewards.xpBossBonus : 0);
  }
  let level = 1;
  let rem = xp;
  while (rem >= xpForNext(level)) {
    rem -= xpForNext(level);
    level++;
  }
  assert.ok(level >= 20 && level <= 25, `clean run reaches level ${level} (expected 20-25)`);
}

// --- Winability: a level-N player beats the stage-50 final boss ------------
async function playBossFight(level, equipment, seed) {
  const p = new Player({
    level,
    equipment,
    stats: null,
    skills: ['powerstrike', 'giantswing', 'mend', 'aim'],
    items: { potion: 3, vial: 0, elixir: 1 },
    rng: makeRng(seed),
  });
  // Rebuild stats for a level-N hero (deterministic growth, average case).
  for (let i = 1; i < level; i++) {
    p.stats0.attack += 1; p.stats0.defense += 1; p.stats0.magic += 1; p.stats0.maxHp += 20;
  }
  const e = createEnemy(50);
  e.maxHp = Math.round(e.maxHp / 6); e.hp = e.maxHp; // shortened fight
  const bus = new EventBus();
  const c = new Combat(p, e, bus);
  TUNING.combat.enemyActionDelayMs = 30;
  c.start();
  let guard = 0;
  while (!c.done && guard++ < 500) {
    if (c.canAct('skill', 'powerstrike')) c.act('skill', 'powerstrike');
    else if (c.p.hp < c.p.maxHp * 0.3 && c.canAct('item', 'potion')) c.act('item', 'potion');
    else if (c.canAct('attack')) c.act('attack');
    else if (c.canAct('guard')) c.act('guard');
    await new Promise((r) => setTimeout(r, 30));
    if (c.done) break;
    if (c.e.hp <= 0) break;
  }
  return c.e.hp <= 0;
}

// --- HP carryover: no heal on win or level-up ------------------------------
async function testHpCarryover() {
  const p = newPlayer(11);
  const e = createEnemy(1);
  e.maxHp = 200; e.hp = 200;
  const c = new Combat(p, e, new EventBus());
  c.start();
  c.p.guarantee = true;
  c.p.hp = 40; // simulate damage taken in battle
  c.e.hp = 1;
  c.act('attack'); // guaranteed kill
  assert.equal(c.done, true);
  p.currentHp = c.p.hp; // main.js does this on win
  const e2 = createEnemy(1);
  e2.maxHp = 300; e2.hp = 300;
  const c2 = new Combat(p, e2, new EventBus(), p.currentHp);
  c2.start();
  assert.equal(c2.p.hp, 40, 'battle starts with carried-over HP (no heal)');
}

// --- Early-pool variants: Minor Mend heals, Swift Edge grants on-hit buff --
async function testEarlyVariants() {
  TUNING.combat.enemyActionDelayMs = 0;
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const p = newPlayer(3);
  p.stats0.magic = 100;
  p.skills = ['minormend', 'swiftedge', 'powerstrike'];
  const e = createEnemy(1);
  e.maxHp = 300; e.hp = 300;
  e.armor = 0;
  const c = new Combat(p, e, new EventBus());
  c.start();
  c.p.guarantee = true; // hits land
  // Minor Mend: heals 10% of max HP.
  c.p.hp = Math.max(1, Math.round(c.p.maxHp * 0.5));
  const before = c.p.hp;
  c.act('skill', 'minormend');
  assert.equal(c.p.hp - before, Math.min(c.p.maxHp - before, Math.round(c.p.maxHp * 0.1)),
    'Minor Mend heals exactly 10% of max HP');
  await tick(); // let the enemy turn resolve so busy clears
  // Swift Edge: on a hit, grants +20% damage for 2 turns.
  assert.ok(!c.p.buffs.damage, 'no damage buff before Swift Edge');
  c.act('skill', 'swiftedge');
  assert.ok(c.p.buffs.damage && c.p.buffs.damage.bonus === 0.2 && c.p.buffs.damage.turns === 2,
    `Swift Edge grants +20% dmg buff on hit (got ${JSON.stringify(c.p.buffs.damage)})`);
}

// --- Balance: each tier kills its own 10-stage block in ~4 turns --------
// Mid-block player attack approximations include level gains + equipment.
async function testTierBalance() {
  TUNING.combat.enemyActionDelayMs = 0;
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const cases = [
    { stage: 5, level: 3, atk: 20, skill: 'steadyslow' }, // T1 vs block 1
    { stage: 15, level: 7, atk: 24, skill: 'heavyslow' }, // T2 vs block 2
    { stage: 25, level: 11, atk: 29, skill: 'sageslow' }, // T3 vs block 3
    { stage: 35, level: 16, atk: 35, skill: 'mountainbreaker' }, // T4 vs block 4
    { stage: 45, level: 20, atk: 39, skill: 'titancrush' }, // T5 vs block 5
  ];
  for (const c of cases) {
    const p = new Player({ level: c.level });
    p.stats0.attack = c.atk;
    p.stats0.magic = 150;
    p.stats0.critChance = 0;
    p.skills = [c.skill];
    const e = createEnemy(c.stage);
    e.type = 'beast'; // blunt 1.0 - neutral matchup
    e.hp = e.maxHp;
    const cb = new Combat(p, e, new EventBus(), null, 150);
    cb.start();
    cb.p.guarantee = true;
    cb.rollEnemyIntent = () => { cb.e.intent = 'attack'; }; // no charge/defend/skill variance
    let turns = 0;
    while (!cb.done && turns < 15) {
      cb.p.energy = 150; // items/regen keep the spell up (damage-math test)
      cb.act('skill', c.skill);
      await tick();
      turns++;
    }
    assert.ok(cb.done, `tier skill wins vs stage-${c.stage} enemy`);
    assert.ok(turns >= 2 && turns <= 8,
      `tier ${Math.ceil(c.stage / 10)} kills its block in ${turns} turns (stage ${c.stage})`);
  }
}

// --- Late-pool skills: Volley (3 hits), Adrenaline (dual buff), Second Wind (heal + cleanse) --
async function testLateSkills() {
  TUNING.combat.enemyActionDelayMs = 0;
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const p = newPlayer(3);
  p.stats0.magic = 150; // pool big enough for all three skills (120 total)
  p.stats0.critChance = 0;
  p.skills = ['volley', 'adrenaline', 'secondwind', 'powerstrike'];
  const e = createEnemy(1);
  e.type = 'beast'; // neutral 1.0 blunt matchup (deterministic damage math)
  e.maxHp = 300; e.hp = 300;
  e.armor = 0;
  const c = new Combat(p, e, new EventBus(), null, 150);
  c.start();
  // Force every Volley hit to land (guarantee only covers the first).
  const strike = c.playerStrike.bind(c);
  c.playerStrike = (s, mult, opts) => strike(s, mult, { ...opts, forceHit: true });
  c.act('skill', 'volley');
  const dmg = 300 - c.e.hp;
  // 3 hits x 125% x 16 atk, +/-15% variance -> 51..69 (no crits)
  assert.ok(dmg >= 50 && dmg <= 70, `Volley deals 3x125% (got ${dmg})`);
  await tick();
  c.act('skill', 'adrenaline');
  assert.ok(c.p.buffs.damage && c.p.buffs.damage.bonus === 0.35 && c.p.buffs.damage.turns === 2,
    'Adrenaline grants +35% damage buff');
  assert.ok(c.p.buffs.hit && c.p.buffs.hit.bonus === 0.35 && c.p.buffs.hit.turns === 2,
    'Adrenaline grants +35% hit buff');
  await tick();
  c.p.buffs.dot = { amount: 5, turns: 3 }; // simulate a poison
  c.p.hp = Math.max(1, Math.round(c.p.maxHp * 0.5));
  c.act('skill', 'secondwind');
  assert.equal(c.p.buffs.dot, null, 'Second Wind purges the dot');
  assert.ok(c.p.hp > Math.round(c.p.maxHp * 0.5), `Second Wind heals (hp ${c.p.hp})`);
}

async function main() {
  await testCombatBasics();
  await testCrystalGuardian();
  await testBossSkills();
  await testLootGoblin();
  await testHealLine();
  await testBurning();
  await testHeroHitRules();
  await testElementWeaknesses();
  await testWardenLightning();
  await testHpCarryover();
  await testTypeSkills();
  await testElementSkills();
  await testEarlyVariants();
  await testLateSkills();
  await testTierBalance();
  const win = await playBossFight(23, { helmet: 3, chest: 5, legs: 5, sword: 5 });
  assert.ok(win, 'Lv 23 player (full equipment) defeats the stage-50 final boss (shortened)');
}

main().then(() => {
  console.log('All smoke tests passed.');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
