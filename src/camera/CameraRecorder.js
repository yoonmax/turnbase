// Records each solve from the camera. The camera stays open while the timer page has
// recording switched on; a recording starts when you put your hands down (or start
// inspection), and stops a moment after the timer stops. Nothing touches the timer:
// times still come only from input events.

import { create } from 'zustand';
import { STATE } from '../timer/TimerStateMachine.js';
import { machine } from '../timer/TimerEngine.js';
import { CLIP_LIMIT, deleteClip, listClipInfo, pruneClips, saveClip, updateClip } from '../storage/ClipRepository.js';

export const useCamera = create(() => ({
  status: 'off', // 'off' | 'starting' | 'on' | 'error'
  error: null,
  stream: null,
  recording: false,
  clipIds: new Set(), // Solves that have a clip.
  devices: [],
}));

const TAIL_MS = 700; // Keep filming briefly after the stop, to see the finish.
const MAX_MS = 5 * 60 * 1000; // Longer solves are not kept, to protect storage.
const MIME_TYPES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4'];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}

export const cameraSupported = () =>
  typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== 'undefined';

let recorder = null;
let chunks = [];
let take = null; // { startedAt, solveStart, solveStop, aborted }
let pending = null; // Promise of the last finished take's clip data.
let unsubscribe = null;
let stopTimer = 0;

export async function refreshDevices() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    useCamera.setState({ devices: all.filter((d) => d.kind === 'videoinput').map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })) });
  } catch {
    // The list is a convenience only.
  }
}

export async function loadClipIds() {
  try {
    const info = await listClipInfo();
    useCamera.setState({ clipIds: new Set(info.map((c) => c.solveId)) });
  } catch {
    // No clips store yet, or storage blocked.
  }
}

export async function openCamera({ deviceId = null } = {}) {
  if (!cameraSupported()) {
    useCamera.setState({ status: 'error', error: 'This browser cannot record from a camera.' });
    return;
  }
  closeCamera();
  useCamera.setState({ status: 'starting', error: null });
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' }),
        width: { ideal: 1280 },
        height: { ideal: 720 },
        // More frames make slow motion smoother. Many cameras can do 60.
        frameRate: { ideal: 60 },
      },
    });
    useCamera.setState({ status: 'on', stream });
    refreshDevices();
    unsubscribe = machine.subscribe(onTimerEvent);
  } catch (error) {
    const denied = error?.name === 'NotAllowedError' || error?.name === 'SecurityError';
    useCamera.setState({
      status: 'error',
      stream: null,
      error: denied ? 'Camera access was blocked. Allow it in your browser to record solves.' : 'No camera could be opened.',
    });
  }
}

export function closeCamera() {
  unsubscribe?.();
  unsubscribe = null;
  abortTake();
  const { stream } = useCamera.getState();
  stream?.getTracks().forEach((track) => track.stop());
  useCamera.setState({ status: 'off', stream: null, recording: false });
}

function begin() {
  const { stream } = useCamera.getState();
  if (!stream || recorder) return;
  const mimeType = pickMimeType();
  try {
    recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 3_000_000 });
  } catch {
    recorder = null;
    return;
  }
  chunks = [];
  const current = { startedAt: performance.now(), solveStart: null, solveStop: null, aborted: false, mimeType: recorder.mimeType || mimeType || 'video/webm' };
  const settings = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
  current.frameRate = settings.frameRate ?? 30;
  take = current;
  const own = recorder;
  own.ondataavailable = (event) => {
    if (event.data?.size) chunks.push(event.data);
  };
  // The clock starts when the recorder really does, not when it was asked to.
  own.onstart = () => {
    current.startedAt = performance.now();
  };
  let finish;
  current.done = new Promise((resolve) => {
    finish = resolve;
  });
  own.onstop = () => {
    const blob = new Blob(chunks, { type: current.mimeType });
    chunks = [];
    if (recorder === own) recorder = null;
    useCamera.setState({ recording: false });
    finish(current.aborted || current.solveStop === null ? null : { blob, ...current });
  };
  own.start(1000);
  useCamera.setState({ recording: true });
}

function end(delay) {
  clearTimeout(stopTimer);
  const own = recorder;
  if (!own) return;
  stopTimer = setTimeout(() => {
    if (own.state !== 'inactive') own.stop();
  }, delay);
}

function abortTake() {
  if (take) take.aborted = true;
  end(0);
}

function onTimerEvent(event) {
  if (event.type !== 'transition') return;
  const { from, to, t } = event;
  if (to === STATE.HOLDING || to === STATE.READY || to === STATE.INSPECTION) {
    if (!recorder) begin();
    return;
  }
  if (to === STATE.RUNNING && take) {
    take.solveStart = t ?? performance.now();
    return;
  }
  if (to === STATE.STOPPED && from === STATE.RUNNING && take) {
    take.solveStop = t ?? performance.now();
    if (take.solveStop - take.solveStart > MAX_MS) take.aborted = true;
    pending = take.done;
    end(TAIL_MS);
    take = null;
    return;
  }
  // Let go too early, cancelled, or left the page: nothing to keep.
  if (to === STATE.IDLE || to === STATE.STOPPED) abortTake();
}

/** Saves the take that just ended as the clip of this solve. */
export async function saveClipFor(solve, allSolveIds = [], { keep = false } = {}) {
  const done = pending;
  pending = null;
  const take = done ? await done : null;
  if (!take || !take.blob.size) return null;
  const clip = {
    solveId: solve.id,
    blob: take.blob,
    mimeType: take.mimeType,
    size: take.blob.size,
    frameRate: take.frameRate,
    startMs: Math.max(0, take.solveStart - take.startedAt),
    endMs: Math.max(0, take.solveStop - take.startedAt),
    createdAt: Date.now(),
    kept: keep,
  };
  await saveClip(clip);
  const removed = await pruneClips([...allSolveIds, solve.id], { limit: CLIP_LIMIT }).catch(() => []);
  const ids = new Set(useCamera.getState().clipIds);
  ids.add(solve.id);
  removed.forEach((id) => ids.delete(id));
  useCamera.setState({ clipIds: ids });
  return clip;
}

export async function removeClip(solveId) {
  await deleteClip(solveId);
  const ids = new Set(useCamera.getState().clipIds);
  ids.delete(solveId);
  useCamera.setState({ clipIds: ids });
}

/** Marks clips to keep, such as every solve of a new best average. Missing clips are skipped. */
export async function keepClips(solveIds) {
  await Promise.all(solveIds.map((id) => updateClip(id, { kept: true }).catch(() => null)));
}
