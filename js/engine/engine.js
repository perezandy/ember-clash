// GENERIC turn-based battle engine. This is the decoupled core: it contains
// the turn state machine, damage math, skill activation, buff/status system,
// AI intent rolling and fx description. It has ZERO knowledge of Ember Clash
// (or any specific game) — everything game-specific arrives through two
// injections:
//
//   content   — a data pack (see js/content/index.js) supplying types,
//               statuses, fx mapping, buff keys/labels, the tier system,
//               the skill catalogs and all tuning numbers.
//   adapter   — { bus, rng, delay } host services: an event bus to emit on,
//               a random source, and a timer (setTimeout in the browser,
//               injectable for tests).
//
// The engine reads the hero (attacker) through a small generic interface:
//   hero.stats() -> { attack, defense, magic, maxEnergy, hit, evasion,
//                     critChance, critDamage, potionHeal, ... }
//   hero.skills  : [ids]   hero.items : { id: count }
//   hero.removeItem(id, n)
// and the enemy through the generic enemy schema (see js/content/enemies.js):
//   behavior ('fleeOnHit' | null), attackStyle ({fx,mult,tier} | null),
//   type, elementWeakness, skills, boss, armor, evasion, critChance, ...
//
// To run a DIFFERENT game: build a different content pack + hero, and
// construct this class. This file is untouched.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class BattleEngine {
  constructor(content, adapter) {
    this.content = content;
    this.bus = adapter.bus;
    this.rng = adapter.rng;
    this.delay = adapter.delay;
  }

  // Host random helpers (all rolls flow through the injected rng so a host
  // can pin determinism, e.g. tests pinning Math.random).
  _chance(p) {
    return this.rng() < p;
  }
  _weightedPick(entries) {
    const total = entries.reduce((s, e) => s + e.weight, 0);
    let r = this.rng() * total;
    for (const e of entries) {
      r -= e.weight;
      if (r <= 0) return e.key;
    }
    return entries[entries.length - 1].key;
  }

  // Initialize one battle. `hero` is the generic attacker object, `enemy`
  // the generic enemy schema. `startHp`/`startEnergy` carry over between
  // battles (clamped into the pools).
  setup(hero, enemy, startHp = null, startEnergy = null) {
    const t = this.content.tuning;
    this.hero = hero;
    this.player = hero; // alias (the generic attacker); kept for familiarity
    this.enemy = { ...enemy };
    this.done = false;
    this.busy = false;

    const s = hero.stats();
    this.p = {
      hp: Math.max(1, Math.min(startHp ?? s.maxHp, s.maxHp)),
      maxHp: s.maxHp,
      // Energy carries over between battles (clamped into the pool).
      energy: Math.min(startEnergy ?? t.player.startEnergy, s.maxEnergy),
      maxEnergy: s.maxEnergy,
      items: { ...hero.items },
      defending: false,
      buffs: this.freshBuffs(),
      swing: 1, // charge multiplier (e.g. a "charge your weapon" skill)
      guarantee: false, // "next attack always hits"
      parry: false,
      riposte: false,
      meditating: false,
      extraAction: false, // "act again on a hit"
    };
    this.e = {
      hp: enemy.maxHp,
      maxHp: enemy.maxHp,
      charging: false,
      defending: false,
      intent: 'attack',
      buffs: this.freshBuffs(),
      energy: Math.min(t.enemyMagic.startEnergy, enemy.magic),
      // GENERIC enemy schema:
      flee: enemy.behavior === 'fleeOnHit', // passive "wait, then run" enemy
      provoked: false,
      fleeCountdown: 0,
      attackStyle: enemy.attackStyle ?? null, // { fx, mult, tier } | null
    };
    this.eHit = Math.min(
      t.enemyAi.enemyHitBase + t.enemyAi.enemyHitPerStage * (enemy.stage - 1),
      0.9
    );
    this.lastKillBonus = null;
  }

  start() {
    this.rollEnemyIntent();
    this.bus.emit('log', { text: `A ${this.enemy.boss ? 'boss: ' : ''}${this.enemy.name} (${this.enemy.typeLabel}) appears (stage ${this.enemy.stage})`, kind: 'system' });
    this.pushState();
    this.bus.emit('phase', { value: 'player' });
  }

  // Build a side's status slots from the content's buff key list (data).
  freshBuffs() {
    const out = {};
    for (const key of this.content.buffKeys) out[key] = null;
    return out;
  }

  rollEnemyIntent() {
    if (this.e.flee) {
      // A passive "wait, then run" enemy never attacks: it waits for the
      // hero to strike, then flees on the following turn.
      this.e.intent = this.e.provoked ? 'flee' : 'wait';
      return;
    }
    const t = this.content.tuning;
    const canSkill = this.enemy.skills.length > 0 && this.e.energy >= t.enemyMagic.skillCost;
    this.e.intent = this._rollIntent(canSkill);
  }

  // Weighted next-action pick driven by the content's AI weights.
  _rollIntent(canSkill) {
    const w = this.content.tuning.enemyAi.weights;
    const entries = [
      { key: 'attack', weight: w.attack },
      { key: 'charge', weight: w.charge },
      { key: 'defend', weight: w.defend },
    ];
    if (canSkill) entries.push({ key: 'skill', weight: w.skill });
    return this._weightedPick(entries);
  }

  // Player action ids: 'attack' | 'guard' | 'skill' (arg = skillId) | 'item' (arg = itemId)
  canAct(action, arg) {
    if (this.done || this.busy) return false;
    if (action === 'skill') {
      const sk = this.content.skillMap[arg];
      if (!sk) return false;
      if (this.p.energy < sk.cost) return false;
    }
    if (action === 'item' && !(this.p.items[arg] > 0)) return false;
    return true;
  }

  act(action, arg) {
    if (!this.canAct(action, arg)) return;
    this.busy = true;
    const s = this.hero.stats();

    if (action === 'attack') {
      let mult = 1;
      if (this.p.swing > 1) {
        mult = this.p.swing;
        this.p.swing = 1;
      }
      const force = this.p.guarantee;
      if (force) this.p.guarantee = false;
      const typeKey = mult > 1 ? 'slash' : 'blunt';
      const r = this.playerStrike(s, mult, { typeKey, forceHit: force });
      this.afterPlayerHit(r, mult > 1 ? ' (charged)' : '');
      // FX: a basic attack is a default-weapon swing; a charged one is a blade.
      this.emitFx('player', mult > 1 ? this.content.fx.weapon.blade : this.content.fx.weapon.default);
    } else if (action === 'guard') {
      this.p.defending = true;
      this.bus.emit('log', { text: 'You brace for the next attack.', kind: 'player' });
      this.bus.emit('sfx', { name: 'defend' });
    } else if (action === 'skill') {
      const sk = this.content.skillMap[arg];
      this.p.energy -= sk.cost;
      this.castSkill('p', sk, s);
    } else if (action === 'item') {
      this.useItem(arg);
    }
    // Attacking (basic or skill) provokes a passive "wait, then run" enemy:
    // it survives one more hero turn (a second hit chance), then runs off on
    // the enemy turn after that.
    if (
      (action === 'attack' || action === 'skill') &&
      this.e.flee &&
      !this.e.provoked &&
      this.e.hp > 0
    ) {
      this.e.provoked = true;
      this.e.fleeCountdown = 1;
      this.bus.emit('log', { text: `${this.enemy.name} prepares to flee!`, kind: 'enemy' });
    }
    this.pushState();

    if (this.e.hp <= 0) return this.finish(true);
    if (this.p.hp <= 0) return this.finish(false);
    // An "act again on a hit" effect grants an extra player action.
    if (this.p.extraAction) {
      this.p.extraAction = false;
      this.busy = false;
      this.bus.emit('phase', { value: 'player' });
      return;
    }
    // Enemy turn, then back to the player.
    this.bus.emit('phase', { value: 'enemy' });
    this.delay(this.content.tuning.combat.enemyActionDelayMs, () => this.enemyTurn());
  }

  // One player strike. `typeKey` selects the weapon matchup (slash = charged
  // weapon, blunt = basic attack); `vsType`/`vsMult` override the matchup for
  // type-specific skills; `element` selects the element affinity and bypasses
  // the weapon matchup (magic, not a weapon). Returns { dmg, crit, hit }.
  playerStrike(s, mult, { typeKey = 'blunt', forceHit = false, ignoreArmor = false, vsType = null, vsMult = null, element = null }) {
    const t = this.content.tuning;
    const typeDef = this.content.types[this.enemy.type];
    let totalMult;
    if (element) {
      totalMult = mult * this.elementMultFor(this.enemy, element);
    } else if (vsType && this.enemy.type === vsType) {
      totalMult = vsMult;
    } else {
      totalMult = mult * typeDef[typeKey];
    }
    const webbed = this.p.buffs.web;
    // The hero never misses — unless webbed, which is a flat accuracy
    // penalty (no enemy-evasion subtraction).
    const hitChance = forceHit || !webbed
      ? 1
      : clamp(
          1 +
            (this.p.buffs.hit?.bonus ?? 0) -
            t.enemyMagic.webPenalty,
          0.05,
          0.98
        );
    if (hitChance < 1 && this._chance(1 - hitChance)) {
      this.bus.emit('log', { text: 'You miss!', kind: 'player' });
      this.bus.emit('sfx', { name: 'miss' });
      return { dmg: 0, crit: false, hit: false };
    }
    const variance = 1 + (this.rng() * 2 - 1) * t.combat.damageVariance;
    let dmg = Math.max(
      1,
      Math.round(s.attack * totalMult * variance * (1 + (this.p.buffs.damage?.bonus ?? 0)))
    );
    const crit = this._chance(s.critChance);
    if (crit) dmg = Math.round(dmg * s.critDamage);
    const defendMult = 1 - Math.max(
      this.e.defending ? t.combat.enemyDefendReduction : 0,
      this.e.buffs.defense?.bonus ?? 0
    );
    let out = Math.round(dmg * defendMult);
    if (!ignoreArmor) out = Math.max(1, out - this.enemy.armor);
    out = Math.max(1, out);
    this.e.hp = Math.max(0, this.e.hp - out);
    if (this.e.defending) this.e.defending = false;
    return { dmg: out, crit, hit: true };
  }

  // The effective element multiplier for one enemy: the creature-type
  // affinities, overridden by the enemy's own `elementWeakness` when present.
  elementMultFor(enemy, element) {
    const base = this.content.types[enemy.type]?.element ?? {};
    const w = enemy.elementWeakness ?? {};
    return (element in w ? w[element] : base[element]) ?? 1;
  }

  afterPlayerHit(r, extra) {
    if (!r.hit) return;
    this.bus.emit('log', {
      text: `${r.crit ? 'CRITICAL! ' : ''}You hit for ${r.dmg}${extra}.`,
      kind: 'player',
    });
    this.bus.emit('hit', { target: 'enemy', crit: r.crit });
  }

  // Log label for a skill's matchup against the current enemy.
  matchupLabel(sk) {
    if (sk.element) {
      const m = this.elementMultFor(this.enemy, sk.element);
      if (m > 1) return ' (weakness!)';
      if (m < 1) return ' (resisted)';
      return '';
    }
    if (sk.vsType && this.enemy.type === sk.vsType) return ' (weakness!)';
    return '';
  }

  givePlayerBuff(b) {
    if (b.damage) this.p.buffs.damage = { bonus: b.damage.bonus, turns: b.damage.turns };
    if (b.defense) this.p.buffs.defense = { bonus: b.defense.bonus, turns: b.defense.turns };
    if (b.hit) this.p.buffs.hit = { bonus: b.hit.bonus, turns: b.hit.turns };
  }

  // FX events: the game describes the attack (kind + tier); the UI renders it.
  emitFx(side, kind, tier = 0) {
    this.bus.emit('fx', { side, kind, tier });
  }

  tierOf(sk) {
    const i = this.content.tierCosts.indexOf(sk.cost);
    if (i >= 0) return i;
    const j = this.content.tierMults.indexOf(sk.mult);
    return j >= 0 ? j : 0;
  }

  // What an attack looks like for a skill (null = nothing to show).
  skillFx(sk) {
    if (sk.element && this.content.fx.element[sk.element]) return { kind: this.content.fx.element[sk.element], tier: this.tierOf(sk) };
    if (sk.weapon === 'blade') return { kind: this.content.fx.weapon.blade, tier: 0 };
    if (sk.type === 'damage') return { kind: this.content.fx.weapon.default, tier: 0 };
    if (sk.healFrac) return { kind: this.content.fx.heal, tier: 0 };
    return null;
  }

  // Unified skill activation shared by the hero and the enemy: purely
  // declarative effect fields (buff/dot/web/defenseDown/drainEnergy/damage
  // + element) — no per-skill code paths. `side`: 'p' = hero casts,
  // 'e' = enemy casts. `stats` is the caster's stats() snapshot (used only
  // for player-strike math).
  castSkill(side, sk, stats = null) {
    const t = this.content.tuning;
    const me = side === 'p' ? this.p : this.e;
    const foe = side === 'p' ? this.e : this.p;
    const kind = side === 'p' ? 'player' : 'enemy';

    if (sk.hpCostFrac) me.hp = Math.max(1, me.hp - Math.round(me.maxHp * sk.hpCostFrac));
    this.bus.emit('log', {
      text: side === 'p'
        ? `You use ${sk.name}!`
        : sk.log
          ? `${this.enemy.name} ${sk.log}`
          : `${this.enemy.name} casts ${sk.name}!`,
      kind,
    });
    this.bus.emit('sfx', { name: 'skill' });

    if (sk.buff) {
      if (sk.buff.damage) me.buffs.damage = { ...sk.buff.damage };
      if (sk.buff.defense) me.buffs.defense = { ...sk.buff.defense };
      if (sk.buff.hit) me.buffs.hit = { ...sk.buff.hit };
    }
    if (sk.healFrac) {
      const heal = Math.round(me.maxHp * sk.healFrac);
      me.hp = Math.min(me.maxHp, me.hp + heal);
      this.bus.emit('log', { text: `You recover ${heal} ❤️.`, kind: 'player' });
    }
    if (sk.meditate) {
      me.meditating = true;
      me.energy = Math.min(me.energy + Math.round(me.maxEnergy * 0.25), me.maxEnergy);
    }
    if (sk.chargeMult) me.swing = sk.chargeMult;
    if (sk.guaranteeNext) me.guarantee = true;
    if (sk.parry) {
      me.parry = true;
      me.defending = true;
    }
    if (sk.riposte) me.riposte = true;
    if (sk.cleanse) {
      me.buffs.dot = null;
      me.meditating = false;
    }
    if (sk.dot) {
      foe.buffs.dot = { ...sk.dot };
      if (side === 'e') this.bus.emit('log', { text: `${this.enemy.name} poisons you!`, kind: 'enemy' });
    }
    if (sk.web) {
      foe.buffs.web = { turns: sk.web.turns };
      if (side === 'e') this.bus.emit('log', { text: `${this.enemy.name} sprays webs — your accuracy drops!`, kind: 'enemy' });
    }
    if (sk.defenseDown) foe.buffs.defenseDown = { ...sk.defenseDown };
    if (sk.drainEnergy) {
      // Drains the target's energy bar for the caster's stage-scaled attack
      // value — the same strength as its normal attack (energy only).
      const drain = Math.max(1, this.enemy.atk);
      const before = foe.energy;
      foe.energy = Math.max(0, foe.energy - drain);
      this.bus.emit('log', { text: `${this.enemy.name} lances your energy — −${before - foe.energy} ⭐!`, kind: 'enemy' });
      this.bus.emit('hit', { target: 'player' });
    }

    if (sk.type === 'damage') {
      if (side === 'p') {
        const hits = sk.hits ?? 1;
        let total = 0;
        let anyCrit = false;
        let landed = false;
        for (let i = 0; i < hits; i++) {
          const r = this.playerStrike(stats, sk.mult, {
            forceHit: this.p.guarantee,
            ignoreArmor: sk.ignoreArmor,
            vsType: sk.vsType,
            vsMult: sk.vsMult,
            element: sk.element,
          });
          if (i === 0 && this.p.guarantee) this.p.guarantee = false;
          total += r.dmg;
          if (r.crit) anyCrit = true;
          landed = landed || r.hit;
        }
        if (landed) {
          this.bus.emit('log', {
            text: `${anyCrit ? 'CRITICAL! ' : ''}${sk.name} hits for ${total}${this.matchupLabel(sk)}.`,
            kind: 'player',
          });
          this.bus.emit('hit', { target: 'enemy', crit: anyCrit });
          if (sk.leech) {
            const heal = Math.round(total * sk.leech);
            this.p.hp = Math.min(this.p.maxHp, this.p.hp + heal);
            this.bus.emit('log', { text: `You drain ${heal} ❤️.`, kind: 'player' });
          }
          if (sk.extraActionOnHit) this.p.extraAction = true;
          if (sk.buffOnHit) this.givePlayerBuff(sk.buffOnHit);
        }
        this.lastKillBonus = sk.killBonus ?? null;
      } else {
        this.enemyDamage(sk.mult, sk.name, sk.element);
      }
    }
    const fx = this.skillFx(sk);
    if (fx) this.emitFx(side === 'p' ? 'player' : 'enemy', fx.kind, fx.tier);

    // Conditional status (data-driven): any content status whose trigger
    // element matches the skill's element can land here (e.g. fire -> burn).
    if (sk.element && foe.hp > 0) {
      for (const st of Object.values(this.content.statuses)) {
        if (st.element && st.element === sk.element && this._chance(st.chance)) {
          if (side === 'p') this.applyStatus(this.e, st, false);
          else this.applyStatus(this.p, st, true);
        }
      }
    }
  }

  // Apply/refresh a conditional status on a side (e.g. burn).
  applyStatus(target, st, isPlayer) {
    const prev = target.buffs[st.key];
    target.buffs[st.key] = {
      amount: Math.max(1, Math.round(target.maxHp * st.maxHpFrac)),
      turns: Math.max(prev?.turns ?? 0, st.turns),
    };
    this.bus.emit('log', { text: st.log(this.enemy.name, isPlayer, !!prev), kind: 'system' });
  }

  // Test/legacy entry point: route a named enemy skill through the shared caster.
  enemySkill(id) {
    this.castSkill('e', this.content.enemySkills[id]);
  }

  // Consumable use: effects come from the content's item effect — no
  // per-item code paths. Supported fields: heal:'potion' (potionHeal of max
  // HP), energy:N (flat), restoreFrac:f (f of max HP and energy).
  useItem(id) {
    const def = this.content.tuning.shop.items[id];
    const fx = def.effect ?? {};
    const hpBefore = this.p.hp;
    const enBefore = this.p.energy;
    if (fx.heal === 'potion') {
      this.p.hp = Math.min(this.p.maxHp, this.p.hp + Math.round(this.p.maxHp * this.hero.stats().potionHeal));
    }
    if (fx.restoreFrac) {
      this.p.hp = Math.min(this.p.maxHp, this.p.hp + Math.round(this.p.maxHp * fx.restoreFrac));
      this.p.energy = Math.min(this.p.maxEnergy, this.p.energy + Math.round(this.p.maxEnergy * fx.restoreFrac));
    }
    if (fx.energy) {
      this.p.energy = Math.min(this.p.maxEnergy, this.p.energy + fx.energy);
    }
    const parts = [];
    if (this.p.hp > hpBefore) parts.push(`recover ${this.p.hp - hpBefore} ❤️`);
    if (this.p.energy > enBefore) parts.push(`recover ${this.p.energy - enBefore} ⭐`);
    this.bus.emit('log', {
      text: parts.length
        ? `You drink a ${def.name} and ${parts.join(' and ')}.`
        : `You drink a ${def.name} (nothing to restore).`,
      kind: 'player',
    });
    this.hero.removeItem(id);
    this.p.items[id] -= 1;
    this.bus.emit('sfx', { name: 'potion' });
  }

  // Apply a stage-scaled enemy attack (× mult) to the player: variance, hit
  // chance, crit, defense (reduced by the defense-down debuff), parry/riposte
  // counters. Shared by normal/charged attacks and spells. `element` marks
  // element spells (handled by the shared caster for conditional statuses).
  enemyDamage(mult = 1, label = null, element = null) {
    const t = this.content.tuning;
    const ps = this.hero.stats();
    const styleMult = this.e.attackStyle?.mult ?? 1;
    const light = this.e.attackStyle?.fx === 'lightning';
    const variance = 1 + (this.rng() * 2 - 1) * t.combat.damageVariance;
    let dmg = Math.max(1, Math.round(this.enemy.atk * mult * variance * (1 + (this.e.buffs.damage?.bonus ?? 0)) * styleMult));
    const hitChance = clamp(this.eHit + (this.e.buffs.hit?.bonus ?? 0) - ps.evasion, 0.05, 0.95);
    if (this._chance(1 - hitChance)) {
      this.bus.emit('log', { text: `${this.enemy.name} misses ${label ?? (light ? 'its lightning bolt' : 'its attack')}!`, kind: 'enemy' });
      this.bus.emit('sfx', { name: 'miss' });
      return;
    }
    const crit = this._chance(this.enemy.critChance);
    const defending = this.p.defending;
    const defendMult = 1 - Math.max(
      defending ? t.combat.defendReduction : 0,
      this.p.buffs.defense?.bonus ?? 0
    );
    if (defending) this.p.defending = false;
    const defDown = this.p.buffs.defenseDown?.bonus ?? 0;
    const defense = defDown > 0 ? Math.max(0, Math.round(ps.defense * (1 - defDown))) : ps.defense;
    dmg = Math.max(1, Math.round(dmg * defendMult) - defense);
    if (crit) dmg = Math.max(dmg, Math.round(dmg * this.enemy.critDamage));
    if (this.p.meditating) dmg *= 2;
    this.p.hp = Math.max(0, this.p.hp - dmg);
    this.bus.emit('log', { text: `${crit ? 'CRITICAL! ' : ''}${this.enemy.name} ${label ? `hits you with ${label} for` : light ? 'hurls a lightning bolt for' : 'hits you for'} ${dmg}.`, kind: 'enemy' });
    this.bus.emit('hit', { target: 'player', crit });
    this.bus.emit('sfx', { name: 'hurt' });
    if (this.p.parry) {
      const ref = Math.max(1, Math.round(dmg * 0.25));
      this.e.hp = Math.max(0, this.e.hp - ref);
      this.bus.emit('log', { text: `You parry and counter for ${ref}!`, kind: 'player' });
      this.bus.emit('hit', { target: 'enemy', crit: false });
    }
    if (this.p.riposte) {
      this.e.hp = Math.max(0, this.e.hp - dmg);
      this.bus.emit('log', { text: `Riposte! You counter for ${dmg}!`, kind: 'player' });
      this.bus.emit('hit', { target: 'enemy', crit: false });
    }
  }

  enemyTurn() {
    if (this.done) return;
    const t = this.content.tuning;
    // Energy regens a flat amount per turn; magic is the pool's cap.
    this.e.energy = Math.min(this.e.energy + t.combat.energyRegen, this.enemy.magic);
    const intent = this.e.intent;
    const charged = this.e.charging;
    this.e.charging = false;
    this.rollEnemyIntent();

    if (this.e.flee) {
      // A passive "wait, then run" enemy never attacks. Unprovoked it
      // crouches and waits; provoked it survives one more hero turn
      // (fleeCountdown), then runs.
      if (this.e.provoked) {
        if (this.e.fleeCountdown <= 0) {
          // It was hit last turn and runs off now: the stage is cleared,
          // but its loot is lost.
          this.bus.emit('log', { text: `${this.enemy.name} flees! (its loot is lost)`, kind: 'system' });
          return this.finish(true, true);
        }
        this.e.fleeCountdown -= 1;
        this.bus.emit('log', { text: `${this.enemy.name} trembles, ready to run!`, kind: 'enemy' });
      } else {
        this.bus.emit('log', { text: `${this.enemy.name} crouches, waiting for you to attack.`, kind: 'enemy' });
      }
    } else if (intent === 'defend') {
      this.e.defending = true;
      this.bus.emit('log', { text: `${this.enemy.name} raises its guard.`, kind: 'enemy' });
    } else if (intent === 'skill') {
      this.e.energy -= t.enemyMagic.skillCost;
      const sid = this.enemy.skills[Math.floor(this.rng() * this.enemy.skills.length)];
      this.enemySkill(sid);
    } else if (intent === 'wait') {
      this.bus.emit('log', { text: `${this.enemy.name} crouches, waiting for you to attack.`, kind: 'enemy' });
    } else {
      const mult =
        (intent === 'charge' ? t.combat.enemyChargeMultiplier : 1) *
        (charged ? t.combat.enemyChargeMultiplier : 1);
      this.enemyDamage(mult);
      // FX: a styled basic attack (e.g. a lightning construct) shows its
      // style; everything else is a default-weapon swing.
      if (this.e.attackStyle) {
        this.emitFx('enemy', this.e.attackStyle.fx, this.e.attackStyle.tier ?? 1);
      } else {
        this.emitFx('enemy', this.content.fx.weapon.default, 0);
      }
    }

    // Enemy conditional-status ticks (in the content's per-side order).
    if (!this.tickStatuses(this.e, 'enemy', false)) return;
    this.tickBuffs(this.e);
    this.pushState();

    if (this.p.hp <= 0) return this.finish(false);
    // Player conditional-status ticks.
    if (!this.tickStatuses(this.p, 'player', true)) return;
    this.tickBuffs(this.p);
    // Temporary player stances expire with the enemy turn.
    this.p.parry = false;
    this.p.riposte = false;
    this.p.meditating = false;
    // Energy regenerates from Magic.
    const ps = this.hero.stats();
    this.p.energy = Math.min(this.p.energy + t.combat.energyRegen, this.p.maxEnergy);
    this.busy = false;
    this.pushState();
    this.bus.emit('phase', { value: 'player' });
  }

  // Tick the conditional/damage-over-time statuses on a side, in the
  // content's per-side order. Returns false if the side died mid-tick
  // (the caller has already ended the battle).
  tickStatuses(sideState, orderKey, isPlayer) {
    const name = isPlayer ? 'you' : this.enemy.name;
    for (const key of this.content.statusTickOrder[orderKey]) {
      const st = this.content.statuses[key];
      const b = sideState.buffs[key];
      if (b && st?.tickLog) {
        sideState.hp = Math.max(0, sideState.hp - (b.amount ?? 0));
        this.bus.emit('log', { text: st.tickLog(this.enemy.name, isPlayer, b.amount ?? 0), kind: 'system' });
        this.pushState();
        if (sideState.hp <= 0) {
          this.finish(isPlayer ? false : true);
          return false;
        }
      }
    }
    return true;
  }

  tickBuffs(side) {
    for (const key of this.content.buffKeys) {
      const b = side.buffs[key];
      if (b) {
        b.turns -= 1;
        if (b.turns <= 0) side.buffs[key] = null;
      }
    }
  }

  finish(playerWon, fled = false) {
    if (this.done) return;
    this.done = true;
    this.busy = false;
    this.bus.emit('phase', {
      value: playerWon ? 'victory' : 'defeat',
      bonus: playerWon ? this.lastKillBonus : undefined,
      fled,
    });
    if (playerWon) {
      this.bus.emit('log', { text: fled ? `${this.enemy.name} escapes with its loot!` : `${this.enemy.name} is defeated!`, kind: 'system' });
    } else {
      this.bus.emit('log', { text: 'You have fallen...', kind: 'system' });
    }
  }

  pushState() {
    const ps = this.hero.stats();
    this.bus.emit('state', {
      player: {
        hp: this.p.hp,
        maxHp: this.p.maxHp,
        energy: this.p.energy,
        maxEnergy: this.p.maxEnergy,
        magic: ps.magic,
        items: { ...this.p.items },
        equipment: { ...this.hero.equipment },
        defending: this.p.defending,
        swing: this.p.swing,
        hit: ps.hit,
        defense: ps.defense,
        evasion: ps.evasion,
        buffs: this.describeBuffs(this.p),
        skillAvailableCount: this.hero.skills.filter((id) => {
          const sk = this.content.skillMap[id];
          return sk && this.p.energy >= sk.cost;
        }).length,
      },
      enemy: {
        name: this.enemy.name,
        sprite: this.enemy.sprite,
        typeLabel: this.enemy.typeLabel,
        hp: this.e.hp,
        maxHp: this.e.maxHp,
        intent: this.e.intent,
        intentLabel:
          this.e.intent === 'skill'
            ? this.content.intentLabels?.skill
            : this.content.intentLabels?.[this.e.intent],
        charging: this.e.charging,
        boss: this.enemy.boss,
        evasion: this.enemy.evasion,
        armor: this.enemy.armor,
        critChance: this.enemy.critChance,
        critDamage: this.enemy.critDamage,
        magic: this.enemy.magic,
        energy: this.e.energy,
        buffs: this.describeBuffs(this.e),
      },
    });
  }

  describeBuffs(side) {
    const out = [];
    for (const [key, b] of Object.entries(side.buffs)) {
      if (b) out.push(`${this.content.buffLabels[key]} ${b.turns}t`);
    }
    return out;
  }
}
