import './polyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { watchForUpdates } from './app/updates';
import './styles/base.css';
import './styles/menu.css';
import './styles/card.css';
import './styles/gauntlet.css';
import './styles/hsdle.css';
import './styles/pvp.css';
import './styles/carddb.css';
import './styles/motion.css';
import './styles/desktop.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

watchForUpdates();
