// Campaign progression: XP/levels, stage rewards, stage advancing,
// level-up skill learning. Owns the persisted save object's `stage` and
// `stats` alongside the Player.
import { TUNING } from '../content/tuning.js';
import { xpForNext } from './upgrades.js';
import { pickSkillChoices } from '../content/skills.js';
import { randInt } from '../core/rng.js';

export class Progression {
  constructor(player, save) {
    this.player = player;
    this.save = save;
  }

  isBossStage(stage) {
    return stage % TUNING.stage.bossEvery === 0;
  }

  isVictoryStage(stage) {
    return stage === TUNING.stage.victoryStage;
  }

  // Call after a stage win. `bonus` is 'gold'|'xp' (kill-bonus skills).
  // Returns: { gold, xp, leveledUp, gain, offer, nextStage, victory }
  // `offer` holds up to 3 distinct skills; the player chooses one on the
  // level-up screen (learn it, or replace a slot / skip).
  onStageWon(stage, bonus = null, fled = false) {
    const p = this.player;
    const s = TUNING;
    const boss = this.isBossStage(stage);

    let gold =
      randInt(s.rewards.goldMin, s.rewards.goldMax) + s.rewards.goldPerStage * stage;
    let xp = s.rewards.xpBase + s.rewards.xpPerStage * stage;
    if (boss) xp += s.rewards.xpBossBonus;
    if (bonus === 'gold') gold *= 2;
    if (bonus === 'xp') xp *= 2;

    p.gold += Math.round(gold);
    if (!fled) this.save.stats.kills += 1;
    this.save.stats.wins += 1;

    const leveledUp = p.addXp(xp);
    let offer = [];
    if (leveledUp > 0) {
      // Gate on the energy POOL (max energy), not the current bar: with flat
      // regen, any cost up to the cap is payable within a few turns, while a
      // cost above the cap is truly "can't use it". This keeps element skills
      // offered at level 11+ instead of only the 0-cost ones.
      offer = pickSkillChoices(p.level, p.skills, p.stats().maxEnergy, 3);
    }

    const victory = this.isVictoryStage(stage);
    const nextStage = stage + 1;
    this.save.stage = nextStage;

    // No restoration on win or level-up: HP carries over between battles.
    // A full restore requires sleeping in a shop bed.

    return {
      gold: Math.round(gold),
      xp,
      leveledUp: leveledUp > 0,
      gain: p._lastLevelUp ?? null,
      offer,
      nextStage,
      victory,
    };
  }

  // Call after a stage loss. Stage stays the same; stats recorded.
  onStageLost() {
    this.save.stats.losses += 1;
  }

  xpForNext() {
    return xpForNext(this.player.level);
  }
}
