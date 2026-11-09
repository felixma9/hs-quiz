import { ATTR, ATTRS, type AttrKey } from '../../lib/attributes';
import { load, save } from '../../lib/storage';

const KEY = 'hsq:gauntlet:settings';

export interface GauntletSettings {
  minionsOnly: boolean;
  /** Fields that can be left blank. */
  allowed: AttrKey[];
}

export const DEFAULT_SETTINGS: GauntletSettings = { minionsOnly: false, allowed: ATTRS.map((a) => a.key) };

export function loadSettings(): GauntletSettings {
  const s = { ...DEFAULT_SETTINGS, ...load<Partial<GauntletSettings>>(KEY, {}) };
  const allowed = s.allowed.filter((k) => k in ATTR);
  return { ...s, allowed: allowed.length ? allowed : DEFAULT_SETTINGS.allowed };
}

export const saveSettings = (s: GauntletSettings) => save(KEY, s);
