import { useEffect, useState } from 'react';
import { ROUTE_TITLES, type Route } from './routes';

/** The top bar: back arrow, mark (or the owner's logo) and the page title. */
export function TitleBar({ route }: { route: Route }) {
  const logo = useDecor();
  return (
    <header className="top">
      <div className="top-inner">
        {route !== 'menu' ? (
          <a href="#/" className="top-back" aria-label="Back to menu">
            ←
          </a>
        ) : (
          <span />
        )}
        <a href="#/" className="top-title">
          {logo ? <img className="decor-logo" src={logo} alt="" /> : <ManaMark />}
          {ROUTE_TITLES[route]}
        </a>
        <span />
      </div>
    </header>
  );
}

/** A small mana-crystal mark (original drawing) for the title bar. */
function ManaMark() {
  return (
    <svg className="mark" viewBox="0 0 22 26" aria-hidden="true">
      <defs>
        <linearGradient id="mana" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8fd0ff" />
          <stop offset="1" stopColor="#1f5fbf" />
        </linearGradient>
      </defs>
      <path d="M11 1 L21 7 L21 19 L11 25 L1 19 L1 7 Z" fill="url(#mana)" stroke="#e8c26a" strokeWidth="1.5" />
      <path d="M11 1 L11 25 M1 7 L21 19 M21 7 L1 19" stroke="rgba(255,255,255,0.25)" strokeWidth="0.8" />
    </svg>
  );
}

/**
 * Optional decor images the owner can drop into public/decor/ (logo.png,
 * background.jpg). Nothing ships there by default; if the files are missing,
 * the site uses its own mark and plain background. Returns the logo URL.
 */
function useDecor(): string | null {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    const base = `${import.meta.env.BASE_URL}decor/`;
    const probe = (file: string, ok: (url: string) => void) => {
      const img = new Image();
      img.onload = () => ok(img.src);
      img.src = base + file;
    };
    probe('logo.png', setLogo);
    probe('background.jpg', (url) => {
      document.body.style.setProperty('--decor-bg', `url("${url}")`);
      document.body.classList.add('has-decor-bg');
    });
  }, []);
  return logo;
}
