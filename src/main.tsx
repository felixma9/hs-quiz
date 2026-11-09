import './polyfills';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/base.css';
import './styles/menu.css';
import './styles/card.css';
import './styles/gauntlet.css';
import './styles/hsdle.css';
import './styles/quickfire.css';
import './styles/theme.css';
import './styles/motion.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
