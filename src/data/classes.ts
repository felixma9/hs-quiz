/**
 * Class badges for the class picker. These are original stand-ins (a color
 * and a symbol per class), not Blizzard's class icons.
 */
export const CLASS_BADGE: Record<string, { color: string; symbol: string }> = {
  DEATHKNIGHT: { color: '#4a9cc4', symbol: '💀' },
  DEMONHUNTER: { color: '#2f8a4a', symbol: '🦇' },
  DRUID: { color: '#8a5a2b', symbol: '🌿' },
  HUNTER: { color: '#4b8d36', symbol: '🏹' },
  MAGE: { color: '#3f7fd6', symbol: '🔮' },
  PALADIN: { color: '#d4a52a', symbol: '🔨' },
  PRIEST: { color: '#c9c9c9', symbol: '🕯️' },
  ROGUE: { color: '#55555f', symbol: '🗡️' },
  SHAMAN: { color: '#2d4fa3', symbol: '⚡' },
  WARLOCK: { color: '#7b3f9e', symbol: '👁️' },
  WARRIOR: { color: '#a83a2f', symbol: '🛡️' },
  NEUTRAL: { color: '#8c7b62', symbol: '⚪' },
};

export const badge = (cls: string) => CLASS_BADGE[cls] ?? { color: '#666', symbol: '?' };
