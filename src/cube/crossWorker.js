// Runs the cross solver off the main thread. Its tables take a few seconds to build the
// first time, and the timer must never stutter while that happens.
import { prepareCrossSolver, solveCross } from './CrossSolver.js';

self.onmessage = (event) => {
  const { id, scramble, bottom } = event.data;
  try {
    if (scramble === null) {
      prepareCrossSolver();
      self.postMessage({ id, result: null });
      return;
    }
    self.postMessage({ id, result: solveCross(scramble, { bottom }) });
  } catch (error) {
    self.postMessage({ id, error: String(error?.message ?? error) });
  }
};
