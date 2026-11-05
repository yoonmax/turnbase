import { NavLink } from 'react-router-dom';
import { BarChart3, Box, Grid2x2, Settings, Target, Timer } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle.jsx';
import { prefetchPage } from '../app/routes.jsx';

const LINKS = [
  { to: '/', label: 'Timer', Icon: Timer, end: true },
  { to: '/algorithms', label: 'Algorithms', Icon: Grid2x2, page: 'algorithms' },
  { to: '/trainer', label: 'Trainer', Icon: Target, page: 'trainer' },
  { to: '/cube', label: 'Cube', Icon: Box, page: 'cube' },
  { to: '/statistics', label: 'Statistics', Icon: BarChart3, page: 'statistics' },
  { to: '/settings', label: 'Settings', Icon: Settings, page: 'settings' },
];

/** A stack of layers with the top one mid-turn: the mark and the name in one idea. */
export function Mark({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="1.5" y="11" width="13" height="3" rx="1.2" />
      <rect x="1.5" y="6.5" width="13" height="3" rx="1.2" />
      <rect x="1.5" y="1.6" width="13" height="3" rx="1.2" transform="rotate(-11 8 3.1)" />
    </svg>
  );
}

export function Navigation() {
  return (
    <nav className="nav focus-fade" aria-label="Main" data-testid="main-nav">
      <NavLink to="/" className="hidden sm:flex items-center gap-2 no-underline text-ink font-semibold" aria-label="turnbase, go to timer">
        <Mark />
        <span style={{ letterSpacing: '-0.03em' }}>turnbase</span>
      </NavLink>
      <div className="nav-links glass">
        {LINKS.map(({ to, label, Icon, end, page }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            data-testid={`nav-${label.toLowerCase()}`}
            // The page's code starts loading as soon as the pointer heads for it.
            onPointerEnter={page ? () => prefetchPage(page) : undefined}
            onFocus={page ? () => prefetchPage(page) : undefined}
          >
            <span className="hidden sm:inline">{label}</span>
            <Icon className="sm:hidden" size={20} strokeWidth={1.8} aria-hidden="true" />
          </NavLink>
        ))}
      </div>
      <div className="hidden sm:block">
        <ThemeToggle />
      </div>
    </nav>
  );
}
