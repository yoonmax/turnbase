import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app/App.jsx';
import './styles/index.css';
import { setupInstall } from './app/install.js';
import { loadClipIds } from './camera/CameraRecorder.js';

setupInstall();
loadClipIds();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
