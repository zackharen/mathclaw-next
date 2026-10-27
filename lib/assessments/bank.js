import { weeklyChoiceQuestion } from "./weekly-choice-bank.js";
import { weeklyQuestion } from "./weekly-bank.js";
import desmos from "./vendor/desmos-bank.cjs";
import addRepairs from "./vendor/repair-bank.cjs";
addRepairs({ QAS: desmos });
import qas from "./vendor/qas-bank.cjs";
import { createHash, randomInt } from "node:crypto";

// Vendored source is server-only in every route; answer-bearing generators never ship to students.
export const SOURCE_VERSIONS = {
  desmos: "ccbccfb02d88cf21212bd97bbce1652497c445e6",
  qas: "94a821177dc8bc8c2931749e5097f2c3d7e5624f",
};
export function topicCatalog() {
  return [
    ...desmos.topics.map((t) => ({
      id: t.id,
      name: t.name,
      lesson: t.lesson,
      bank: "desmos",
    })),
    ...desmos.repairTopics.map((t) => ({
      id: `repair:${t.id}`,
      name: `Repair · ${t.name}`,
      lesson: t.lesson,
      bank: "desmos",
    })),
    ...qas.topics.map((t) => ({
      id: `qas:${t.id}`,
      name: `QAS · ${t.name}`,
      bank: "qas",
    })),
  ];
}
export function makeQuestion(
  skill,
  level = 2,
  seed = randomInt(1, 2147483647),
  slot = randomInt(0, 4),
) {
  if (skill.startsWith("weekly-mc:")) {
    const q = weeklyChoiceQuestion(skill.slice(10), level, seed);
    const offset = slot % 4;
    const correct = q.choices.shift();
    q.choices.splice(offset, 0, correct);
    return {
      ...q,
      id: createHash("sha256")
        .update(`${skill}|${seed}`)
        .digest("hex")
        .slice(0, 20),
    };
  }
  if (skill.startsWith("weekly:")) {
    const q = weeklyQuestion(skill.slice(7), level, seed);
    return {
      ...q,
      id: createHash("sha256")
        .update(`${skill}|${seed}`)
        .digest("hex")
        .slice(0, 20),
    };
  }
  let q;
  if (skill.startsWith("qas:")) {
    // The local adapter adds seeded randomness without changing the source question models.
    q = qas.seeded(skill.slice(4), level, seed, slot);
  } else
    q = skill.startsWith("repair:")
      ? desmos.repairSeeded(skill.slice(7), level, seed, slot)
      : desmos.seeded(skill, level, seed, slot);
  return {
    ...q,
    id: createHash("sha256")
      .update(`${skill}|${q.signature}|${seed}`)
      .digest("hex")
      .slice(0, 20),
    skill,
    generator: skill,
    points: 3,
    criteria:
      "3 points for a correct response; the teacher can award partial credit for supporting work.",
    desmos: true,
    supports: "Desmos calculator",
    solution: q.steps.join("\n"),
    manual: false,
  };
}
export function assessmentVariation(q, salt) {
  if (!q.generator)
    throw Error("This question needs a teacher-authored fresh variation.");
  const seed = createHash("sha256")
    .update(`${salt}|${q.id}`)
    .digest()
    .readUInt32LE();
  const out = makeQuestion(q.generator, q.level || 3, seed, seed % 4);
  return {
    ...out,
    id: q.id,
    points: q.points,
    criteria: q.criteria,
    desmos: q.desmos,
    supports: q.supports,
    spiral: q.spiral,
  };
}
