import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { seedDemoDataIfNeeded } from './db/seed';
import { initAppUpdates } from './pwa/updates';

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  );
}

// Seed the first-launch demo plan before routing resolves. seedDemoDataIfNeeded
// is idempotent and swallows its own errors, so app boot is never blocked.
seedDemoDataIfNeeded().finally(renderApp);

// Registered after the app is on screen — an update check must never delay
// first paint.
initAppUpdates();
