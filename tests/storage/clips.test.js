import { beforeEach, describe, expect, it } from 'vitest';
import { clearAll } from '../../src/storage/Database.js';
import { getClip, listClipInfo, pruneClips, saveClip, updateClip } from '../../src/storage/ClipRepository.js';

const clip = (solveId, createdAt, extra = {}) => ({ solveId, createdAt, blob: new Blob(['x']), size: 1, mimeType: 'video/webm', startMs: 100, endMs: 900, kept: false, ...extra });

describe('camera clips', () => {
  beforeEach(async () => {
    await clearAll();
  });

  it('saves, reads and marks a clip to keep', async () => {
    await saveClip(clip('a', 1));
    expect((await getClip('a')).endMs).toBe(900);
    await updateClip('a', { kept: true });
    expect((await listClipInfo())[0]).toMatchObject({ solveId: 'a', kept: true });
  });

  it('keeps only the newest clips, plus kept ones', async () => {
    for (let i = 0; i < 6; i += 1) await saveClip(clip(`s${i}`, i, { kept: i === 0 }));
    const removed = await pruneClips(['s0', 's1', 's2', 's3', 's4', 's5'], { limit: 3 });
    expect(removed.sort()).toEqual(['s1', 's2']);
    expect((await listClipInfo()).map((c) => c.solveId).sort()).toEqual(['s0', 's3', 's4', 's5']);
  });

  it('removes clips of deleted solves only after a grace period, so undo still finds them', async () => {
    await saveClip(clip('gone', 1000));
    expect(await pruneClips([], { now: 1000 + 60_000 })).toEqual([]);
    expect(await pruneClips([], { now: 1000 + 60 * 60_000 })).toEqual(['gone']);
  });
});
