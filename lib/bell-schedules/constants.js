export const BELL_SCHEDULE_TYPE_NAME_MAX = 80;
export const BELL_SCHEDULE_BLOCK_LABEL_MAX = 80;

export function normalizeBellScheduleTypeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, BELL_SCHEDULE_TYPE_NAME_MAX);
}

export function normalizeBellScheduleBlockLabel(value) {
  const trimmed = String(value || "").trim().replace(/\s+/g, " ").slice(0, BELL_SCHEDULE_BLOCK_LABEL_MAX);
  return trimmed || null;
}

// Accepts "HH:MM" (a <input type="time"> value) or "HH:MM:SS" (a Postgres
// `time` column read back through PostgREST); returns minutes since
// midnight, or null if not a valid time of day. Seconds are ignored --
// period boundaries only need minute precision.
export function parseTimeOfDayToMinutes(value) {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(String(value || "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function normalizeBellScheduleBlockInput({ courseId, startTime, endTime, label }) {
  if (!courseId) return { error: "Choose a class." };
  const startMinutes = parseTimeOfDayToMinutes(startTime);
  const endMinutes = parseTimeOfDayToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return { error: "Enter valid start and end times." };
  if (endMinutes <= startMinutes) return { error: "End time must be after start time." };
  return {
    values: {
      course_id: courseId,
      start_time: startTime,
      end_time: endTime,
      label: normalizeBellScheduleBlockLabel(label),
    },
  };
}

// Blocks within the same schedule type may not overlap -- a period can't
// have two classes at once. `candidate.id` (on an edit) excludes itself from
// the comparison. Blocks may come from the DB (`start_time`/`end_time`) or a
// draft form (`startTime`/`endTime`).
export function blocksOverlap(existingBlocks, candidate) {
  const candidateStart = parseTimeOfDayToMinutes(candidate.startTime ?? candidate.start_time);
  const candidateEnd = parseTimeOfDayToMinutes(candidate.endTime ?? candidate.end_time);
  if (candidateStart === null || candidateEnd === null) return false;
  return (existingBlocks || []).some((block) => {
    if (candidate.id && block.id === candidate.id) return false;
    const blockStart = parseTimeOfDayToMinutes(block.startTime ?? block.start_time);
    const blockEnd = parseTimeOfDayToMinutes(block.endTime ?? block.end_time);
    if (blockStart === null || blockEnd === null) return false;
    return candidateStart < blockEnd && blockStart < candidateEnd;
  });
}

// The block (if any) covering "now" within one schedule type's blocks.
// Used both by the receiver-facing resolver and by anything previewing a
// schedule type in the editor.
export function findActiveBellScheduleBlock(blocks, nowMinutes) {
  return (blocks || []).find((block) => {
    const start = parseTimeOfDayToMinutes(block.startTime ?? block.start_time);
    const end = parseTimeOfDayToMinutes(block.endTime ?? block.end_time);
    if (start === null || end === null) return false;
    return nowMinutes >= start && nowMinutes < end;
  }) || null;
}
