import { Fragment } from 'react';

/** Render a prompt's **bold** markers. */
export function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split('**').map((part, i) => (
        <Fragment key={i}>{i % 2 ? <b>{part}</b> : part}</Fragment>
      ))}
    </>
  );
}
