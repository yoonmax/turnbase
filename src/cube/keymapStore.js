import { create } from 'zustand';
import { kvGet, kvSet } from '../storage/Database.js';
import { BUILT_IN_PROFILES, bindingProblem, validateProfile } from './CubeControls.js';
import { newId } from '../utils/format.js';

export const useKeymaps = create((set, get) => ({
  loaded: false,
  activeId: 'direct',
  custom: {},

  async load() {
    if (get().loaded) return;
    const saved = await kvGet('keymaps', null);
    set({ activeId: saved?.activeId ?? 'direct', custom: saved?.custom ?? {}, loaded: true });
  },

  async persist() {
    const { activeId, custom } = get();
    await kvSet('keymaps', { activeId, custom });
  },

  profiles() {
    return { ...BUILT_IN_PROFILES, ...get().custom };
  },

  active() {
    const { activeId } = get();
    return get().profiles()[activeId] ?? BUILT_IN_PROFILES.direct;
  },

  async setActive(id) {
    set({ activeId: id });
    await get().persist();
  },

  /** A new editable profile, copied from an existing one. */
  async duplicate(fromId, name) {
    const from = get().profiles()[fromId];
    const id = newId('keys');
    const profile = { id, name, description: `Based on ${from.name}.`, builtIn: false, bindings: { ...from.bindings } };
    set((state) => ({ custom: { ...state.custom, [id]: profile }, activeId: id }));
    await get().persist();
    return profile;
  },

  /** Binds a key. Reports a conflict instead of acting unless `replace` is set. */
  async bind(profileId, combo, moveText, { replace = false } = {}) {
    const profile = get().custom[profileId];
    if (!profile) return { ok: false, message: 'Built-in profiles cannot be changed. Make a copy first.' };
    const problem = bindingProblem(profile, combo, moveText);
    if (problem?.kind === 'reserved') return { ok: false, message: problem.message };
    if (problem?.kind === 'conflict' && !replace) return { ok: false, conflict: true, message: problem.message };
    const bindings = { ...profile.bindings, [combo]: moveText };
    set((state) => ({ custom: { ...state.custom, [profileId]: { ...profile, bindings } } }));
    await get().persist();
    return { ok: true };
  },

  async unbind(profileId, combo) {
    const profile = get().custom[profileId];
    if (!profile) return;
    const bindings = { ...profile.bindings };
    delete bindings[combo];
    set((state) => ({ custom: { ...state.custom, [profileId]: { ...profile, bindings } } }));
    await get().persist();
  },

  async remove(profileId) {
    set((state) => {
      const custom = { ...state.custom };
      delete custom[profileId];
      return { custom, activeId: state.activeId === profileId ? 'direct' : state.activeId };
    });
    await get().persist();
  },

  async importProfile(doc) {
    const clean = validateProfile(doc);
    const id = newId('keys');
    const profile = { id, name: clean.name, description: 'Imported.', builtIn: false, bindings: clean.bindings };
    set((state) => ({ custom: { ...state.custom, [id]: profile }, activeId: id }));
    await get().persist();
    return profile;
  },

  /** Back to the shipped profiles. Custom profiles are removed. */
  async resetAll() {
    set({ custom: {}, activeId: 'direct' });
    await get().persist();
  },
}));
