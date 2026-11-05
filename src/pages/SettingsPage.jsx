import { useState } from 'react';
import { useApp } from '../app/store.js';
import { CUBE_SCHEMES, FACE_NAMES, resolveScheme } from '../cube/CubeThemes.js';
import { KeymapEditor } from '../cube/KeymapEditor.jsx';
import { ConfirmDialog } from '../components/Modal.jsx';
import { exportAll, solvesToCsv } from '../storage/Backup.js';
import { listAllSolves } from '../storage/SolveRepository.js';
import { downloadText, pickFile } from '../utils/download.js';
import { useProgress } from '../trainer/TrainingProgress.js';
import { useKeymaps } from '../cube/keymapStore.js';
import { PUZZLES } from '../scrambles/PuzzleRegistry.js';
import { ThemeEditor } from '../settings/ThemeEditor.jsx';

const SECTIONS = ['Appearance', 'Timer', 'Inspection', 'Scrambles', 'Cube controls', 'Cube appearance', 'Animation', 'Sound', 'Statistics', 'Data', 'Accessibility'];

function Setting({ label, hint, children, htmlFor }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 border-t border-rule">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block">
          {label}
        </label>
        {hint ? <p className="m-0 text-[0.8125rem] font-normal text-graphite max-w-[52ch]">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ id, label, hint, value, onChange }) {
  return (
    <Setting label={label} hint={hint} htmlFor={id}>
      <button id={id} type="button" role="switch" aria-checked={Boolean(value)} className="switch" data-testid={`setting-${id}`} onClick={() => onChange(!value)} />
    </Setting>
  );
}

function Choice({ id, label, hint, value, options, onChange }) {
  return (
    <Setting label={label} hint={hint}>
      <div className="segmented" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" aria-pressed={value === v} data-testid={`setting-${id}-${v}`} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </Setting>
  );
}

function Slider({ id, label, hint, value, min, max, step, format, onChange }) {
  return (
    <Setting label={label} hint={hint} htmlFor={id}>
      <div className="flex items-center gap-3">
        <input id={id} type="range" className="w-36" min={min} max={max} step={step} value={value} data-testid={`setting-${id}`} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="notation text-[0.75rem] w-14 text-right tabular" data-testid={`setting-${id}-value`}>
          {format(value)}
        </span>
      </div>
    </Setting>
  );
}

function Group({ title, children }) {
  return (
    <section id={title.toLowerCase().replace(/ /g, '-')} className="scroll-mt-4" data-testid={`group-${title.toLowerCase().replace(/ /g, '-')}`}>
      <h2 className="m-0 mb-2 text-[0.9375rem] font-medium">{title}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const resetSettings = useApp((s) => s.resetSettings);
  const importBackup = useApp((s) => s.importBackup);
  const wipeEverything = useApp((s) => s.wipeEverything);
  const pushToast = useApp((s) => s.pushToast);
  const sessions = useApp((s) => s.sessions);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const set = (key) => (value) => update({ [key]: value });
  const colors = resolveScheme(settings);

  const exportJson = async () => {
    const doc = await exportAll();
    downloadText(`turnbase-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(doc, null, 2));
  };
  const exportCsv = async () => {
    const solves = await listAllSolves();
    downloadText(`turnbase-solves-${new Date().toISOString().slice(0, 10)}.csv`, solvesToCsv(solves, new Map(sessions.map((s) => [s.id, s.name]))), 'text/csv');
  };
  const importJson = async () => {
    const file = await pickFile();
    if (!file) return;
    try {
      const doc = JSON.parse(await file.text());
      const { sessions: s, solves } = await importBackup(doc);
      await useProgress.getState().reload();
      useKeymaps.setState({ loaded: false });
      await useKeymaps.getState().load();
      pushToast({ message: `Imported ${s} sessions and ${solves} solves` });
    } catch (error) {
      pushToast({ message: `Import failed: ${error.message}`, durationMs: 9000 });
    }
  };

  return (
    <div className="h-full overflow-y-auto scrollbar-quiet page-scroll" data-testid="settings-page">
      <div className="max-w-[56rem] mx-auto px-4 sm:px-6 grid md:grid-cols-[10rem_1fr] gap-8">
        <nav className="hidden md:block sticky top-0 self-start" aria-label="Settings sections">
          <ul className="m-0 p-0 list-none flex flex-col gap-1 text-[0.8125rem]">
            {SECTIONS.map((name) => (
              <li key={name}>
                <a className="no-underline text-graphite hover:text-ink" href={`#${name.toLowerCase().replace(/ /g, '-')}`}>
                  {name}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-8 min-w-0">
          <header className="flex items-center justify-between gap-3">
            <h1 className="m-0 text-xl font-medium tracking-tight">Settings</h1>
            <button type="button" className="btn" data-testid="reset-settings" onClick={() => setConfirmReset(true)}>
              Reset to defaults
            </button>
          </header>

          <Group title="Appearance">
            <ThemeEditor Choice={Choice} Slider={Slider} Setting={Setting} />
          </Group>

          <Group title="Timer">
            <Slider id="holdMs" label="Hold time" hint="How long to hold the trigger before the timer is ready." value={settings.holdMs} min={0} max={1000} step={50} format={(v) => `${v} ms`} onChange={set('holdMs')} />
            <Choice id="trigger" label="Start and stop with" hint="Two keys means F and J held together, in the spirit of a Stackmat. It is a keyboard, so it does not reproduce a Stackmat's sensors." value={settings.trigger} options={[['space', 'Space'], ['enter', 'Enter'], ['twokey', 'F and J']]} onChange={set('trigger')} />
            <Toggle id="stopWithAnyKey" label="Any key stops the timer" hint="Off means only the start key stops it." value={settings.stopWithAnyKey} onChange={set('stopWithAnyKey')} />
            <Toggle id="hideRunningTime" label="Hide the time while solving" value={settings.hideRunningTime} onChange={set('hideRunningTime')} />
            <Choice id="decimals" label="Decimal places" hint="Recorded results and averages are always hundredths. This changes how a finished solve is displayed, and running time shows at most two places." value={settings.decimals} options={[[1, '1'], [2, '2'], [3, '3']]} onChange={set('decimals')} />
            <Slider id="timerFontScale" label="Timer size" value={settings.timerFontScale} min={0.6} max={1.2} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={set('timerFontScale')} />
            <Toggle id="timerColors" label="Colour the digits while holding" hint="Amber while holding, green when ready." value={settings.timerColors} onChange={set('timerColors')} />
            <Toggle id="focusMode" label="Focus mode" hint="Hide everything except the digits while a solve is underway." value={settings.focusMode} onChange={set('focusMode')} />
            <div className="py-2.5 border-t border-rule" data-testid="timer-shortcuts">
              <p className="m-0">Keyboard shortcuts on the timer</p>
              <dl className="m-0 mt-1 grid grid-cols-[auto_1fr] gap-x-4 text-[0.8125rem] text-graphite">
                <dt className="notation text-[0.75rem] text-ink">Alt+1</dt>
                <dd className="m-0">Remove the penalty from the last solve</dd>
                <dt className="notation text-[0.75rem] text-ink">Alt+2</dt>
                <dd className="m-0">Give the last solve +2</dd>
                <dt className="notation text-[0.75rem] text-ink">Alt+3</dt>
                <dd className="m-0">Mark the last solve DNF</dd>
                <dt className="notation text-[0.75rem] text-ink">Alt+Z</dt>
                <dd className="m-0">Delete the last solve, with undo</dd>
                <dt className="notation text-[0.75rem] text-ink">Alt+N</dt>
                <dd className="m-0">New scramble</dd>
                <dt className="notation text-[0.75rem] text-ink">Esc</dt>
                <dd className="m-0">Abandon the attempt in progress, recording nothing</dd>
              </dl>
            </div>
          </Group>

          <Group title="Inspection">
            <p className="m-0 mb-2 text-[0.8125rem] text-graphite max-w-[64ch]">
              A practice simulation of the April 1, 2026 WCA Regulations: starting at 15.00 s gives +2, and at 17.00 s gives DNF. This is not certified competition equipment.
            </p>
            <Toggle id="inspection" label="Use inspection" hint="Press and release once to start inspecting, then hold and release to start solving." value={settings.inspection} onChange={set('inspection')} />
            <Toggle id="inspectionAutoPenalties" label="Apply penalties automatically" hint="Off still records what you earned, but applies nothing." value={settings.inspectionAutoPenalties} onChange={set('inspectionAutoPenalties')} />
            <Toggle id="inspectionAudio" label="Beep at 8 and 12 seconds" hint="The two times a judge calls out." value={settings.inspectionAudio} onChange={set('inspectionAudio')} />
            <Toggle id="inspectionVisual" label="Change colour at 8 and 12 seconds" value={settings.inspectionVisual} onChange={set('inspectionVisual')} />
          </Group>

          <Group title="Scrambles">
            <p className="m-0 mb-2 text-[0.8125rem] text-graphite max-w-[64ch]">
              WCA-style practice scrambles from cubing.js, not official competition scrambles. Competitions require TNoodle, and you can paste a TNoodle scramble with the pen button by the scramble. Sessions set which puzzle you are scrambling: {PUZZLES.map((p) => p.name).join(', ')}.
            </p>
            <Slider id="scrambleFontScale" label="Scramble text size" value={settings.scrambleFontScale} min={0.7} max={1.6} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={set('scrambleFontScale')} />
            <Toggle id="showScrambleDiagram" label="Show the scramble diagram" value={settings.showScrambleDiagram} onChange={set('showScrambleDiagram')} />
          </Group>

          <Group title="Cube controls">
            <KeymapEditor />
          </Group>

          <Group title="Cube appearance">
            <Choice id="cubeStyle" label="Style" value={settings.cubeStyle} options={[['stickered', 'Stickered'], ['stickerless', 'Stickerless']]} onChange={set('cubeStyle')} />
            <Setting label="Colour scheme" htmlFor="scheme">
              <select id="scheme" className="field" value={settings.cubeScheme} data-testid="setting-cubeScheme" onChange={(e) => update({ cubeScheme: e.target.value, customColors: e.target.value === 'custom' ? settings.customColors ?? colors : settings.customColors })}>
                {Object.entries(CUBE_SCHEMES).map(([id, scheme]) => (
                  <option key={id} value={id}>
                    {scheme.name}
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </Setting>
            {settings.cubeScheme === 'custom' ? (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 py-2.5 border-t border-rule" data-testid="custom-colors">
                {Object.keys(FACE_NAMES).map((face) => (
                  <label key={face} className="flex flex-col gap-1 text-[0.8125rem] text-graphite">
                    {FACE_NAMES[face]}
                    <input
                      type="color"
                      value={colors[face]}
                      className="w-full h-8 rounded border border-rule bg-transparent"
                      data-testid={`color-${face}`}
                      onChange={(e) => update({ customColors: { ...colors, [face]: e.target.value } })}
                    />
                  </label>
                ))}
              </div>
            ) : null}
            <Choice id="cubeEnvironment" label="Backdrop" hint="Follow the page, or keep the cube on a fixed light or dark backdrop." value={settings.cubeEnvironment} options={[['auto', 'Follow theme'], ['light', 'Light'], ['dark', 'Dark']]} onChange={set('cubeEnvironment')} />
          </Group>

          <Group title="Animation">
            <Slider id="turnMs" label="Turn duration" value={settings.turnMs} min={40} max={500} step={10} format={(v) => `${v} ms`} onChange={set('turnMs')} />
            <Choice id="turnEasing" label="Easing" value={settings.turnEasing} options={[['smooth', 'Smooth'], ['crisp', 'Crisp'], ['linear', 'Linear']]} onChange={set('turnEasing')} />
            <Toggle id="instantMoves" label="Instant moves" hint="Skip turn animation entirely." value={settings.instantMoves} onChange={set('instantMoves')} />
          </Group>

          <Group title="Sound">
            <Toggle id="turnSound" label="Turn sounds" hint="A small click for each cube turn." value={settings.turnSound} onChange={set('turnSound')} />
            <Toggle id="timerSound" label="Timer sounds" hint="A tone when the timer is ready and when it stops." value={settings.timerSound} onChange={set('timerSound')} />
          </Group>

          <Group title="Statistics">
            <Setting label="Added rolling averages" hint="Add these on the Statistics page. They appear there alongside ao5, ao12, ao50, ao100 and ao1000.">
              <span className="notation text-[0.8125rem]" data-testid="extra-windows">
                {settings.extraWindows.length ? settings.extraWindows.map((n) => `ao${n}`).join(', ') : 'None'}
              </span>
            </Setting>
          </Group>

          <Group title="Data">
            <p className="m-0 mb-3 text-[0.8125rem] text-graphite max-w-[64ch]">Everything is stored only in this browser, on this device. Export a backup before clearing your browser data.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" data-testid="export-all" onClick={exportJson}>
                Export all data (JSON)
              </button>
              <button type="button" className="btn" data-testid="export-all-csv" onClick={exportCsv}>
                Export solves (CSV)
              </button>
              <button type="button" className="btn" data-testid="import-backup" onClick={importJson}>
                Import a backup
              </button>
              <button type="button" className="btn btn-danger" data-testid="wipe-data" onClick={() => setConfirmWipe(true)}>
                Delete all data
              </button>
            </div>
          </Group>

          <Group title="Accessibility">
            <Choice id="reducedMotion" label="Reduce interface motion" hint="System follows your device setting." value={settings.reducedMotion} options={[['system', 'System'], ['on', 'Reduce'], ['off', 'Full motion']]} onChange={set('reducedMotion')} />
            <Toggle id="highContrast" label="Higher contrast" hint="Stronger secondary text and dividers." value={settings.highContrast} onChange={set('highContrast')} />
            <Toggle id="largeText" label="Larger text" value={settings.largeText} onChange={set('largeText')} />
          </Group>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset settings?"
        body="Every setting goes back to its default. Your solves are not affected."
        confirmLabel="Reset settings"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          resetSettings();
        }}
      />
      <ConfirmDialog
        open={confirmWipe}
        title="Delete all data?"
        body="Every solve, session, setting and practice record on this device will be removed. This cannot be undone. Export a backup first if you may want them."
        confirmLabel="Delete everything"
        onCancel={() => setConfirmWipe(false)}
        onConfirm={async () => {
          setConfirmWipe(false);
          await wipeEverything();
          await useProgress.getState().reload();
          useKeymaps.setState({ loaded: false });
          await useKeymaps.getState().load();
          pushToast({ message: 'All data deleted' });
        }}
      />
    </div>
  );
}
