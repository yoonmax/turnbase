// One shared solver worker, with answers remembered per scramble and cross color.
import { useEffect, useState } from 'react';

let worker = null;
let nextId = 1;
const pending = new Map();
const cache = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./crossWorker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (event) => {
    const { id, result, error } = event.data;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (error) entry.reject(new Error(error));
    else entry.resolve(result);
  };
  worker.onerror = () => {
    for (const entry of pending.values()) entry.reject(new Error('The cross solver stopped.'));
    pending.clear();
    worker = null;
  };
  return worker;
}

function ask(scramble, bottom) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, scramble, bottom });
  });
}

/** Builds the solver's tables in the background, so the first answer comes quickly. */
export function warmCrossSolver() {
  if (typeof Worker === 'undefined') return;
  ask(null, null).catch(() => {});
}

export function solveCrossAsync(scramble, bottom = 'D') {
  const key = `${bottom}|${scramble}`;
  if (!cache.has(key)) {
    const promise = ask(scramble, bottom).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, promise);
  }
  return cache.get(key);
}

/** { status: 'idle' | 'working' | 'done' | 'error', result } for a scramble. */
export function useCrossSolution(scramble, bottom, enabled = true) {
  const [answer, setAnswer] = useState({ status: 'idle', result: null, key: null });
  const key = `${bottom}|${scramble}`;
  useEffect(() => {
    if (!enabled || !scramble) return undefined;
    let live = true;
    setAnswer({ status: 'working', result: null, key });
    solveCrossAsync(scramble, bottom).then(
      (result) => live && setAnswer({ status: result ? 'done' : 'error', result, key }),
      () => live && setAnswer({ status: 'error', result: null, key }),
    );
    return () => {
      live = false;
    };
  }, [scramble, bottom, enabled, key]);
  return answer.key === key ? answer : { status: enabled && scramble ? 'working' : 'idle', result: null };
}
