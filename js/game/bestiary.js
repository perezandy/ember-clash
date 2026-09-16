// Bestiary: records of defeated creatures, persisted in the save.
// Entries are derived from enemy definitions (enemies.js) + skill names.
import { TYPES, weaknessOf, elementSummaryFor } from '../content/enemies.js';
import { ENEMY_SKILLS } from '../content/skills.js';

export function bestiaryEntryFor(enemy) {
  return {
    id: enemy.id,
    name: enemy.name,
    type: TYPES[enemy.type].label,
    sprite: enemy.sprite,
    skills: enemy.skills.map((id) => ENEMY_SKILLS[id]?.name ?? id),
    weakness: weaknessOf(enemy.type),
    element: elementSummaryFor(enemy),
  };
}

// Merge a kill into the bestiary store (plain object in the save).
export function recordKill(bestiary, enemy) {
  const entry = bestiaryEntryFor(enemy);
  const prev = bestiary[enemy.id];
  bestiary[enemy.id] = {
    ...entry,
    kills: (prev?.kills ?? 0) + 1,
  };
  return bestiary;
}
