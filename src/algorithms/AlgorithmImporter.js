// Imports user algorithms from text. Each line is "name: notation", or just notation.
// Blank lines and lines starting with # are skipped. Every line is parsed with the
// same parser as everything else, and a bad line is reported, not guessed at.

import { parseAlgorithm } from '../cube/CubeNotationParser.js';

export function parseImportText(text) {
  const algorithms = [];
  const problems = [];
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    // A colon inside brackets belongs to a conjugate, not a name.
    const colon = line.indexOf(':');
    const bracket = line.indexOf('[');
    const hasName = colon > 0 && (bracket < 0 || colon < bracket);
    const name = hasName ? line.slice(0, colon).trim() : `Algorithm ${algorithms.length + 1}`;
    const notation = hasName ? line.slice(colon + 1).trim() : line;
    const parsed = parseAlgorithm(notation);
    if (!parsed.ok) {
      problems.push(`Line ${index + 1}: ${parsed.error.message}`);
    } else if (!parsed.moves.length) {
      problems.push(`Line ${index + 1}: there are no moves here.`);
    } else {
      algorithms.push({ name, notation });
    }
  });
  return { algorithms, problems };
}
