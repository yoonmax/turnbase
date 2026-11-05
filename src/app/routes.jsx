import { lazy } from 'react';
import { Route, Routes } from 'react-router-dom';
import TimerPage from '../pages/TimerPage.jsx';

// The timer ships in the main bundle so it is ready first. Everything else, including
// all of Three.js, loads when it is opened or when the pointer heads towards it.
const LOADERS = {
  algorithms: () => import('../pages/AlgorithmsPage.jsx'),
  trainer: () => import('../pages/TrainerPage.jsx'),
  cube: () => import('../pages/CubePage.jsx'),
  statistics: () => import('../pages/StatisticsPage.jsx'),
  settings: () => import('../pages/SettingsPage.jsx'),
};

export const prefetchPage = (name) => {
  LOADERS[name]?.().catch(() => {
    // The real navigation will surface this, with a way to retry.
  });
};

const AlgorithmsPage = lazy(LOADERS.algorithms);
const TrainerPage = lazy(LOADERS.trainer);
const CubePage = lazy(LOADERS.cube);
const StatisticsPage = lazy(LOADERS.statistics);
const SettingsPage = lazy(LOADERS.settings);

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<TimerPage />} />
      <Route path="/algorithms/*" element={<AlgorithmsPage />} />
      <Route path="/trainer/*" element={<TrainerPage />} />
      <Route path="/cube/*" element={<CubePage />} />
      <Route path="/statistics" element={<StatisticsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<TimerPage />} />
    </Routes>
  );
}
