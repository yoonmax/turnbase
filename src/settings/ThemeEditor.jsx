import { Check } from 'lucide-react';
import { useApp } from '../app/store.js';
import { DEFAULT_CUSTOM_THEME, PALETTES, contrast, isHex } from '../app/themes.js';

function Swatch({ name, paper, ink, blooms, accent, selected, onClick, testId, glow }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={`${name} theme`}
      data-testid={testId}
      onClick={onClick}
      className="flex flex-col gap-1.5 items-start bg-transparent border-none p-0 text-[0.8125rem]"
    >
      <span
        className="relative block w-full h-16 rounded-2xl overflow-hidden"
        style={{
          background: paper,
          boxShadow: selected ? `0 0 0 2px var(--accent)` : '0 0 0 1px var(--rule)',
        }}
      >
        <span
          className="absolute inset-0"
          aria-hidden="true"
          style={{
            opacity: glow,
            background: `radial-gradient(70% 90% at 15% 10%, ${blooms[0]}, transparent 70%), radial-gradient(70% 90% at 90% 20%, ${blooms[1]}, transparent 70%)`,
          }}
        />
        <span className="absolute left-2.5 bottom-2 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: accent, color: paper }}>
          {selected ? <Check size={12} strokeWidth={3} /> : null}
        </span>
        <span className="absolute right-2.5 top-2 text-[0.9375rem] font-black tabular" style={{ color: ink }}>
          9.41
        </span>
      </span>
      <span className={selected ? 'text-ink' : 'text-graphite'}>{name}</span>
    </button>
  );
}

function ColorField({ label, value, onChange, testId }) {
  return (
    <label className="flex flex-col gap-1 text-[0.8125rem] text-graphite">
      {label}
      <input type="color" value={value} className="w-full h-9 rounded-xl bg-transparent" data-testid={testId} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Choosing a look: a palette or your own colors, an accent, and how much glass. */
export function ThemeEditor({ Choice, Slider, Setting }) {
  const settings = useApp((s) => s.settings);
  const update = useApp((s) => s.updateSettings);
  const custom = { ...DEFAULT_CUSTOM_THEME, ...(settings.customTheme ?? {}) };
  const isDark = typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark';
  const setCustom = (key) => (value) => update({ palette: 'custom', customTheme: { ...custom, [key]: value } });
  const usingCustomAccent = isHex(settings.accent);
  const paletteAccent = (PALETTES[settings.palette] ?? PALETTES.glacier)[isDark ? 'dark' : 'light'].accent;

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 py-3 border-t border-rule" data-testid="theme-swatches" role="group" aria-label="Theme">
        {Object.entries(PALETTES).map(([id, palette]) => {
          const look = palette[isDark ? 'dark' : 'light'];
          return (
            <Swatch
              key={id}
              name={palette.name}
              paper={look.paper}
              ink={look.ink}
              blooms={look.blooms}
              accent={look.accent}
              selected={settings.palette === id}
              testId={`palette-${id}`}
              glow={settings.bloom}
              onClick={() => update({ palette: id })}
            />
          );
        })}
        <Swatch
          name="Custom"
          paper={custom.paper}
          ink={contrast('#ffffff', custom.paper) >= contrast('#000000', custom.paper) ? '#f3f4f6' : '#14161a'}
          blooms={[custom.bloomA, custom.bloomB]}
          accent={custom.accent}
          selected={settings.palette === 'custom'}
          testId="palette-custom"
          glow={settings.bloom}
          onClick={() => update({ palette: 'custom', customTheme: custom })}
        />
      </div>

      {settings.palette === 'custom' ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-3 border-t border-rule" data-testid="custom-theme">
          <ColorField label="Background" value={custom.paper} testId="custom-paper" onChange={setCustom('paper')} />
          <ColorField label="Accent" value={custom.accent} testId="custom-accent" onChange={setCustom('accent')} />
          <ColorField label="Glow one" value={custom.bloomA} testId="custom-bloomA" onChange={setCustom('bloomA')} />
          <ColorField label="Glow two" value={custom.bloomB} testId="custom-bloomB" onChange={setCustom('bloomB')} />
          <p className="col-span-full m-0 text-[0.8125rem] text-graphite">Text colors are worked out from your background, so they always stay readable.</p>
        </div>
      ) : (
        <Choice id="theme" label="Mode" value={settings.theme} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} onChange={(theme) => update({ theme })} />
      )}

      {settings.palette !== 'custom' ? (
        <Setting label="Accent color" hint="Used for primary buttons, switches and sliders." htmlFor="accent-color">
          <div className="flex items-center gap-2">
            {usingCustomAccent ? (
              <button type="button" className="btn btn-quiet" data-testid="accent-reset" onClick={() => update({ accent: null })}>
                Use the theme's
              </button>
            ) : null}
            <input
              id="accent-color"
              type="color"
              className="w-9 h-9 rounded-full bg-transparent"
              value={usingCustomAccent ? settings.accent : paletteAccent}
              data-testid="accent-picker"
              onChange={(e) => update({ accent: e.target.value })}
            />
          </div>
        </Setting>
      ) : null}

      <Slider id="glass" label="Glass" hint="How much the panels blur what is behind them. At 0% they are solid, which is the lightest setting for older devices." value={settings.glass} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(glass) => update({ glass })} />
      <Slider id="bloom" label="Background glow" value={settings.bloom} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(bloom) => update({ bloom })} />
    </>
  );
}
