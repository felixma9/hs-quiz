/** Set code -> display name and release year (used for "close" clues). New sets must also be appended to SHARE_SETS in src/pool/shareCode.ts (a test checks). */
export const SETS: Record<string, { name: string; year: number }> = {
  // HearthstoneJSON's LEGACY is the original Basic set (Fireball, Chillwind Yeti). The game now files Basic and Classic both under "Legacy".
  LEGACY: { name: 'Basic', year: 2014 },
  EXPERT1: { name: 'Classic', year: 2014 },
  NAXX: { name: 'Curse of Naxxramas', year: 2014 },
  GVG: { name: 'Goblins vs Gnomes', year: 2014 },
  BRM: { name: 'Blackrock Mountain', year: 2015 },
  TGT: { name: 'The Grand Tournament', year: 2015 },
  LOE: { name: 'League of Explorers', year: 2015 },
  OG: { name: 'Whispers of the Old Gods', year: 2016 },
  KARA: { name: 'One Night in Karazhan', year: 2016 },
  GANGS: { name: 'Mean Streets of Gadgetzan', year: 2016 },
  UNGORO: { name: "Journey to Un'Goro", year: 2017 },
  ICECROWN: { name: 'Knights of the Frozen Throne', year: 2017 },
  LOOTAPALOOZA: { name: 'Kobolds & Catacombs', year: 2017 },
  GILNEAS: { name: 'The Witchwood', year: 2018 },
  BOOMSDAY: { name: 'The Boomsday Project', year: 2018 },
  TROLL: { name: "Rastakhan's Rumble", year: 2018 },
  DALARAN: { name: 'Rise of Shadows', year: 2019 },
  ULDUM: { name: 'Saviors of Uldum', year: 2019 },
  DRAGONS: { name: 'Descent of Dragons', year: 2019 },
  YEAR_OF_THE_DRAGON: { name: "Galakrond's Awakening", year: 2020 },
  DEMON_HUNTER_INITIATE: { name: 'Demon Hunter Initiate', year: 2020 },
  BLACK_TEMPLE: { name: 'Ashes of Outland', year: 2020 },
  SCHOLOMANCE: { name: 'Scholomance Academy', year: 2020 },
  DARKMOON_FAIRE: { name: 'Madness at the Darkmoon Faire', year: 2020 },
  // Core launched in March 2021, before Barrens. It's refreshed every year and always in Standard, so the set picker files it with the newest year (see CORE_YEAR).
  CORE: { name: 'Core', year: 2026 },
  THE_BARRENS: { name: 'Forged in the Barrens', year: 2021 },
  STORMWIND: { name: 'United in Stormwind', year: 2021 },
  ALTERAC_VALLEY: { name: 'Fractured in Alterac Valley', year: 2021 },
  THE_SUNKEN_CITY: { name: 'Voyage to the Sunken City', year: 2022 },
  REVENDRETH: { name: 'Murder at Castle Nathria', year: 2022 },
  PATH_OF_ARTHAS: { name: 'Path of Arthas', year: 2022 },
  RETURN_OF_THE_LICH_KING: { name: 'March of the Lich King', year: 2022 },
  BATTLE_OF_THE_BANDS: { name: 'Festival of Legends', year: 2023 },
  TITANS: { name: 'TITANS', year: 2023 },
  WILD_WEST: { name: 'Showdown in the Badlands', year: 2023 },
  WHIZBANGS_WORKSHOP: { name: "Whizbang's Workshop", year: 2024 },
  WONDERS: { name: 'Caverns of Time', year: 2024 },
  ISLAND_VACATION: { name: 'Perils in Paradise', year: 2024 },
  SPACE: { name: 'The Great Dark Beyond', year: 2024 },
  EMERALD_DREAM: { name: 'Into the Emerald Dream', year: 2025 },
  THE_LOST_CITY: { name: "The Lost City of Un'Goro", year: 2025 },
  TIME_TRAVEL: { name: 'Across the Timeways', year: 2025 },
  CATACLYSM: { name: 'Cataclysm', year: 2026 },
  ESCAPEFROM_VIOLET_HOLD: { name: 'Escape from Violet Hold', year: 2026 },
  BE: { name: 'Reign of the Black Empire', year: 2026 },
  // Event cards here are all from 2025-26 events (see released()).
  EVENT: { name: 'Event', year: 2025 },
};

/**
 * Sets legal in Standard: Core, Event, and the expansions of the last two
 * Hearthstone years. Update at each spring rotation (the year's first expansion).
 */
export const STANDARD_SETS: readonly string[] = [
  'CORE', 'EVENT',
  // 2025: Year of the Raptor
  'EMERALD_DREAM', 'THE_LOST_CITY', 'TIME_TRAVEL',
  // 2026
  'CATACLYSM', 'ESCAPEFROM_VIOLET_HOLD', 'BE',
];

/** Year the Core set launched (cards first printed in that first Core, CS3_*). */
const CORE_YEAR = 2021;

/**
 * Core and Event cards came out alongside other sets. Their IDs say which,
 * so the timeline can place them there.
 */
const BY_PREFIX: [RegExp, string][] = [
  [/^CS3_/, 'CORE'],
  [/^RLK_/, 'PATH_OF_ARTHAS'],
  [/^TTN_/, 'TITANS'],
  [/^(CORE_)?EDR_/, 'EMERALD_DREAM'],
  [/^TLC_/, 'THE_LOST_CITY'],
  [/^TIME_/, 'TIME_TRAVEL'],
  [/^(CORE_)?CATA_/, 'CATACLYSM'],
  [/^JAIL_/, 'ESCAPEFROM_VIOLET_HOLD'],
  [/^BE_/, 'BE'],
];

const ORDER = Object.keys(SETS);

/** When a card first came out: its place in the release order and its year. */
export function released(card: { id: string; set: string }): { rank: number; year: number } {
  let at = card.set;
  if (card.set === 'CORE' || card.set === 'EVENT') at = BY_PREFIX.find(([re]) => re.test(card.id))?.[1] ?? card.set;
  const i = ORDER.indexOf(at);
  return { rank: i < 0 ? ORDER.length : i, year: at === 'CORE' ? CORE_YEAR : (SETS[at]?.year ?? 0) };
}

export function setName(code: string): string {
  return SETS[code]?.name ?? code;
}
