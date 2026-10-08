import React from 'react';
import ReactDOM from 'react-dom/client';
import { onHostConfig } from './sdk/mnemo-sdk';
import App from './App';
import './app.css';
import './activities.css';
import { adoptHostLang } from './i18n/useI18n';
import { adoptHostZoom } from './lib/distance';

/** One subscription to the shell: the SDK applies theme and design tokens on
 *  its own, and hands us the language and the canvas zoom (the far view).
 *  Registered before render so the first paint is already themed. */
onHostConfig((cfg) => {
  adoptHostLang(cfg.lang);
  adoptHostZoom(cfg.zoom);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
