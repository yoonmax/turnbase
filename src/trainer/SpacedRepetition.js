// SM-2, the scheduling algorithm from Piotr Woźniak's SuperMemo 2 (1990).
//
// After each review the learner gives a quality from 0 to 5. Quality below 3 restarts
// the card. Otherwise the interval grows: 1 day, 6 days, then the previous interval
// times the card's ease factor. Ease moves with each answer and never drops below 1.3.

const DAY_MS = 24 * 60 * 60 * 1000;

export function review(record, quality, now = Date.now()) {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  let { ease = 2.5, intervalDays = 0, repetitions = 0 } = record;
  if (q < 3) {
    repetitions = 0;
    intervalDays = 0; // Again later in this session, then tomorrow.
  } else {
    repetitions += 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * ease);
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { ...record, ease, intervalDays, repetitions, dueAt: now + intervalDays * DAY_MS };
}

export const isDue = (record, now = Date.now()) => !record || record.dueAt === null || record.dueAt === undefined || record.dueAt <= now;

/** How well a case is known, from how far its schedule has grown. */
export function masteryLevel(record) {
  if (!record || !record.repetitions) return record?.attempts ? 'Learning' : 'New';
  if (record.intervalDays >= 21) return 'Mastered';
  if (record.intervalDays >= 6) return 'Known';
  return 'Learning';
}

/**
 * Chooses the next case. Overdue cases come first, most overdue first, then new ones,
 * then those with low accuracy. The rest are only reached when nothing else is left.
 * `avoid` keeps the same case from appearing twice running when there is a choice.
 */
export function pickNext(cases, progress, { now = Date.now(), avoid = null, random = Math.random } = {}) {
  if (!cases.length) return null;
  const pool = cases.length > 1 && avoid ? cases.filter((c) => c.id !== avoid) : cases;
  const scored = pool.map((entry) => {
    const record = progress.get(entry.id);
    let weight;
    if (!record || !record.attempts) weight = 3;
    else if (isDue(record, now)) weight = 4 + Math.min(4, (now - (record.dueAt ?? now)) / DAY_MS) + (1 - accuracy(record)) * 3;
    else weight = 0.1 + (1 - accuracy(record));
    return { entry, weight };
  });
  const total = scored.reduce((sum, s) => sum + s.weight, 0);
  let roll = random() * total;
  for (const s of scored) {
    roll -= s.weight;
    if (roll <= 0) return s.entry;
  }
  return scored[scored.length - 1].entry;
}

export function accuracy(record) {
  if (!record?.attempts) return 0;
  return record.correct / record.attempts;
}

export function average(values) {
  if (!values?.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}
