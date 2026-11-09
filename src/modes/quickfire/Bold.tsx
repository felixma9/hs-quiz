import { Fragment, type ReactNode } from 'react';
import { StatGem, classIcon } from '../../app/icons';

const CLASSES = ['Death Knight', 'Demon Hunter', 'Druid', 'Hunter', 'Mage', 'Paladin', 'Priest', 'Rogue', 'Shaman', 'Warlock', 'Warrior', 'Neutral'];
const classCode = (name: string) => name.toUpperCase().replace(/ /g, '');

/** A class name with its icon in front. */
export function ClassName({ name }: { name: string }) {
  return (
    <span className="class-inline">
      <img src={classIcon(classCode(name))} alt="" draggable={false} />
      {name}
    </span>
  );
}

/** One **bold** part of a prompt, drawn with game icons where they fit. */
function part(text: string, before: string): ReactNode {
  let m: RegExpMatchArray | null;
  // "3/2" -> attack and health gems.
  if ((m = text.match(/^(\d+)\/(\d+)$/))) {
    return (
      <span className="stat-pair">
        <StatGem kind="attack" n={m[1]} />
        <StatGem kind="health" n={m[2]} />
      </span>
    );
  }
  // "4 Attack" / "4 Health".
  if ((m = text.match(/^(\d+) (Attack|Health)$/))) {
    return (
      <span className="stat-word">
        <StatGem kind={m[2] === 'Attack' ? 'attack' : 'health'} n={m[1]} /> {m[2]}
      </span>
    );
  }
  // "costs 4" -> a mana gem.
  if (/^\d+$/.test(text) && /costs\s*$/.test(before)) return <StatGem kind="mana" n={text} />;
  // "Mage minion", "Legendary Mage minion": the class gets its icon.
  const cls = CLASSES.find((c) => text === c || text.startsWith(`${c} `) || text.includes(` ${c} `) || text.endsWith(` ${c}`));
  if (cls) {
    const i = text.indexOf(cls);
    return (
      <>
        {text.slice(0, i)}
        <ClassName name={cls} />
        {text.slice(i + cls.length)}
      </>
    );
  }
  return text;
}

/** Render a prompt's **bold** markers, with stat gems and class icons. */
export function Bold({ text }: { text: string }) {
  const parts = text.split('**');
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>{i % 2 ? <b>{part(p, parts[i - 1] ?? '')}</b> : p}</Fragment>
      ))}
    </>
  );
}
