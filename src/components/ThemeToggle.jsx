import { Moon, Sun } from 'lucide-react';
import { useApp } from '../app/store.js';

export function ThemeToggle() {
  const updateSettings = useApp((s) => s.updateSettings);
  const palette = useApp((s) => s.settings.palette);
  // A custom theme's background decides whether it is light or dark.
  if (palette === 'custom') return null;
  const toggle = () => {
    const isDark = document.documentElement.dataset.theme === 'dark';
    updateSettings({ theme: isDark ? 'light' : 'dark' });
  };
  return (
    <button type="button" className="icon-btn glass !w-11 !h-11" aria-label="Switch between light and dark" title="Switch between light and dark" onClick={toggle} data-testid="theme-toggle">
      <Sun size={16} strokeWidth={1.8} className="hidden [[data-theme=dark]_&]:block" />
      <Moon size={16} strokeWidth={1.8} className="block [[data-theme=dark]_&]:hidden" />
    </button>
  );
}
