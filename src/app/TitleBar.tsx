import { ICON } from './icons';
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

/** The mana crystal from the card frames, as the site mark. */
function ManaMark() {
  return <img className="mark" src={ICON.mana} alt="" draggable={false} />;
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
