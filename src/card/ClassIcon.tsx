import { useState } from 'react';
import { badge } from '../data/classes';

/** Classes whose custom icon file is missing, so we stop asking for it. */
const missing = new Set<string>();

/**
 * A class icon. If the site owner has added public/class-icons/<CLASS>.png
 * (e.g. DRUID.png), that image is shown; otherwise the original badge
 * (a color and a symbol). Nothing ships in that folder by default.
 */
export function ClassIcon({ cls, small = false }: { cls: string; small?: boolean }) {
  const [failed, setFailed] = useState(missing.has(cls));
  const b = badge(cls);
  if (failed) {
    return (
      <span className={`class-icon ${small ? 'small' : ''}`} style={{ background: b.color }}>
        {b.symbol}
      </span>
    );
  }
  return (
    <img
      className={`class-icon custom ${small ? 'small' : ''}`}
      src={`${import.meta.env.BASE_URL}class-icons/${cls}.png`}
      alt=""
      onError={() => {
        missing.add(cls);
        setFailed(true);
      }}
    />
  );
}
