// Scramble generation. All computation happens in cubing.js's own web worker, so
// it never blocks the main thread, and a small buffer per puzzle means a new
// scramble is usually available the moment a solve ends.
//
// There is deliberately no fallback to random moves if the generator fails. A
// failure surfaces as an error with a retry, because a silently weaker scramble
// is worse than none.

import { SCRAMBLE_LIBRARY, SCRAMBLE_LIBRARY_VERSION, getPuzzle } from './PuzzleRegistry.js';

const BUFFER_SIZE = 2;

let modulePromise = null;
const loadModule = () => {
  if (!modulePromise) {
    const url = `${import.meta.env.BASE_URL}vendor/cubing/scramble.js`;
    modulePromise = import(/* @vite-ignore */ url).catch((error) => {
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
};

const buffers = new Map();

function buffer(puzzleId) {
  if (!buffers.has(puzzleId)) buffers.set(puzzleId, []);
  return buffers.get(puzzleId);
}

async function generate(puzzleId) {
  const { randomScrambleForEvent } = await loadModule();
  const alg = await randomScrambleForEvent(puzzleId);
  const puzzle = getPuzzle(puzzleId);
  return {
    text: alg.toString(),
    meta: {
      puzzle: puzzleId,
      method: puzzle.method,
      library: SCRAMBLE_LIBRARY,
      version: SCRAMBLE_LIBRARY_VERSION,
      official: false,
    },
  };
}

function refill(puzzleId) {
  const queue = buffer(puzzleId);
  while (queue.length < BUFFER_SIZE) {
    const pending = generate(puzzleId);
    // A failed buffered scramble is dropped, so a retry can try again.
    pending.catch(() => {
      const at = queue.indexOf(pending);
      if (at >= 0) queue.splice(at, 1);
    });
    queue.push(pending);
  }
}

/** Resolves to a scramble nobody has been given before. */
export async function nextScramble(puzzleId) {
  refill(puzzleId);
  const pending = buffer(puzzleId).shift();
  const scramble = await pending;
  refill(puzzleId);
  return scramble;
}

/** Warms the buffer so the first scramble of a session has no wait. */
export function prefetchScrambles(puzzleId) {
  refill(puzzleId);
}

let twistyPromise = null;
export function loadTwisty() {
  if (!twistyPromise) {
    const url = `${import.meta.env.BASE_URL}vendor/cubing/twisty.js`;
    twistyPromise = import(/* @vite-ignore */ url).catch((error) => {
      twistyPromise = null;
      throw error;
    });
  }
  return twistyPromise;
}
