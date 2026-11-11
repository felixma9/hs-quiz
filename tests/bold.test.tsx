import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Bold } from '../src/modes/quickdraw/Bold';

const html = (text: string) => renderToStaticMarkup(<Bold text={text} />);

describe('Bold prompt text', () => {
  it('keeps a cost gem on the same line as "costs"', () => {
    const h = html('Name a **minion** that costs **4**');
    expect(h).toMatch(/^Name a <b>minion<\/b> that <span class="nowrap">costs <b><span class="gem-inline gem-mana"/);
  });
  it('draws stat pairs and class names with icons', () => {
    expect(html('Name a **5/3** minion')).toContain('gem-attack');
    expect(html('Name a **Mage minion**')).toContain('class-icons/MAGE.webp');
  });
  it('leaves plain prompts alone', () => {
    expect(html('Finish the Legendary **Druid** minion: Ce…')).toContain('Finish the Legendary ');
  });
});
