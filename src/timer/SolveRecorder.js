// Builds and edits solve records. The raw duration is never changed: penalties sit
// beside it, and everything shown is derived from the two together.

import { resultCs } from '../statistics/AverageCalculator.js';
import { newId } from '../utils/format.js';

export function buildSolve({
  rawMs,
  penalty = 'none',
  inspectionMs = null,
  inspectionPenalty = 'none',
  sessionId,
  puzzle = '333',
  scramble = '',
  scrambleMeta = null,
  source = 'physical',
  moves = null,
  createdAt = Date.now(),
  comment = '',
  tags = [],
}) {
  const hasAutoPenalty = penalty !== 'none';
  return {
    id: newId('solve'),
    sessionId,
    createdAt,
    rawMs: Math.floor(rawMs),
    displayedCs: resultCs(Math.floor(rawMs), penalty),
    penalty,
    penaltySource: hasAutoPenalty ? 'inspection' : null,
    inspectionMs,
    inspectionPenalty,
    puzzle,
    scramble,
    scrambleMeta,
    source,
    moves,
    reconstruction: '',
    comment,
    tags,
  };
}

export function withPenalty(solve, penalty) {
  return {
    ...solve,
    penalty,
    penaltySource: penalty === 'none' ? null : 'user',
    displayedCs: resultCs(solve.rawMs, penalty),
  };
}

/** A plain-text description for copying a solve to the clipboard. */
export function describeSolve(solve, formatted) {
  const parts = [formatted];
  if (solve.scramble) parts.push(solve.scramble);
  if (solve.comment) parts.push(`Comment: ${solve.comment}`);
  if (solve.tags?.length) parts.push(`Tags: ${solve.tags.join(', ')}`);
  return parts.join('\n');
}
