# HS Quiz

A browser quiz on Hearthstone cards.

Cards are drawn with in-game frames, with the fields you have to guess left blank. You fill them in on the card itself: tap the frame to cycle classes (or pick from the class list), tap the rarity gem to cycle rarities, and tap the cost, attack or health gem, the name banner, the text box or the tribe banner to type or choose. Your answers are drawn onto the card as you go. The class badges in the picker are simple original stand-ins, not the game's class icons.

- **Gauntlet:** each card has one field blank (cost, attack, health, name, text, class, rarity or tribe). Fill it in. You have 3 lives; stuck? Reveal the answer for one life. See how many cards you clear. Fields with only one possible answer in your pool (e.g. rarity when only Legendaries are picked) are never asked. Settings let you pick minions only or which fields can be blank.
- **Quickfire:** a party game for phones. One player hosts a room and shares the 4-letter code or invite link; everyone joins from their own device. Players take turns answering prompts like "Name a minion with 4 Attack", "Name a Shadow spell that costs 4" or "Finish the Legendary minion: Ragnar…" (name prompts only use Legendaries) before the rope round the table burns down (8, 12 or 20 seconds). Run out of time and you lose a life (1–5); the last player standing wins. Rooms always use every collectible card (the menu's card pool doesn't apply), and any real card that fits is accepted. Right answers in a row speed things up: each one takes 8% off the next turn's rope (down to 40% of the chosen time, never under 3 seconds), shown as a ⚡ badge; when someone's rope burns out it resets. Each card counts once per game. Names are forgiving: typos are fine and part of a name works if it has a whole word ("grommash" for Grommash Hellscream); when that could mean several cards, the one that fits the prompt counts. Just the first few letters (like a finish-the-name hint) aren't enough. and everyone sees what the current player is typing in a speech bubble above their seat (rejected guesses turn the bubble red). A big banner shows whose turn it is; on your turn it turns gold, the screen edges glow and phones that support it buzz. Prompts are built from real cards (`src/modes/quickfire/prompts.ts`), so there's always an answer. **Practise solo** plays the same game alone (same prompts, rope, lives and seconds settings, no network) and keeps your best score for each lives/seconds setting. On phones, when the keyboard is open the game tightens up so the turn, timer, prompt, input and last result all stay visible above it. All of Quickfire uses every collectible card; the menu's card pool only affects Gauntlet and HSdle. Rooms have sound effects (synthesized with Web Audio in `src/lib/sound.ts`, no audio files): your-turn chime, ticks in the last seconds, right/wrong answers, the fuse running out, joins, and a win/lose sting. The speaker button mutes them on that device.
  - Rooms are peer-to-peer (PeerJS): the host's browser runs the game (`party/game.ts`) and guests connect to it directly (`party/net.ts`). The free public PeerJS server only introduces the browsers, so there's no server of our own. The host must keep the page open; if they leave, the room closes. Some strict networks (occasionally mobile data) block peer-to-peer connections.
- **Card pool:** on the main menu, choose (for Gauntlet and HSdle) which rarities and sets cards come from (saved on your device; new expansions start switched on).
- **Share settings:** the menu shows a short code for your rarities, sets and Gauntlet settings. Copy it or the link and send it to a friend; they paste the code into the menu (or open the link and tap "Use them") to play with the same setup. Codes refer to sets by their position in `SHARE_SETS` (`src/pool/shareCode.ts`), so new sets only ever go on the end of that list.
- **HSdle:** guess the mystery minion (daily, or unlimited). Type any minion's name; each guess adds a row comparing it to the answer on Mana, Attack, Health, Rarity, Tribe, Keywords, Class and Set: 🟩 same, 🟨 partly the same (a shared keyword, tribe or class, or a set from the same year), 🟥 different, with arrows toward the answer (higher stats, newer set, rarer card). An art clue unlocks after 4 wrong guesses and a card-text clue after 8. You can give up after your first guess (tap twice) to see the answer.

Card text is free-typed and graded on meaning: filler words ("a", "the", "your"...) don't count, word order doesn't matter, number words equal digits ("two" = "2"), plurals match, and small typos are fine (1 letter in words of 4+ letters, 2 in words of 8+). It's right at 70% of the meaningful words, as long as all the numbers are there. Names allow a typo or two.

Play it at https://felixma9.github.io/hs-quiz/ (the `gh-pages` branch holds the built site; run `npm run deploy` to update it).

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # grading + data pipeline tests
npm run build      # static site in dist/
```

## Project layout

```
src/
  App.tsx, main.tsx        wiring: routes, card loading, page shell
  app/                     title bar (+ decor), menu, routes, #/card/<id> preview
  card/                    the drawn card: GameCard (tap to fill in), sunwell.ts (drawing),
                           layout.ts (tap areas), fitText.ts, pickers, name editor, class icons
  pool/                    card pool: set + rarity filters and their menu pickers
  modes/gauntlet/          Gauntlet mode
  modes/hsdle/             HSdle mode: compare.ts (column logic), Board, Search, Clues, Art
  lib/                     shared logic: card types, attributes, grading, fuzzy matching, storage
  data/                    set names/years, class badges
  styles/                  base, menu, card, gauntlet, hsdle
  types/                   type declarations for Sunwell
scripts/                   build-cards.ts (+ transform.ts), measure-art.py
tests/                     vitest: grading, fuzzy matching, card data, HSdle compare
```

## Card data

`public/cards.json` is built from [HearthstoneJSON](https://hearthstonejson.com) by `npm run cards`. Rerun it after a new expansion. It keeps collectible minions, spells, weapons, heroes and locations, drops Core/Vanilla reprints in favor of the original card, and cleans the text markup. If the script warns about new set codes, add them to `src/data/sets.ts`.

Art is loaded from `art.hearthstonejson.com` (art only, so it doesn't give the answers away).

## Art cropping

Much of the art is padded with light bars. `python3 -I scripts/measure-art.py` downloads each minion's small art once, measures the bars and writes `public/art-crop.json`; HSdle's art and thumbnails zoom in just enough per card. Rerun it after `npm run cards` (it only measures new cards).

## Decor

The Hearthstone touches (mana-gem mark, gold accent) are original. To use your own logo or background, put `logo.png` and/or `background.jpg` in `public/decor/`; only add images you have the right to use on a public site.

## Class icons

The class picker uses simple original badges. To use your own icons, add `public/class-icons/<CLASS>.png` (e.g. `DRUID.png`); classes without a file keep the badge. Only add images you have the right to use on a public site.

## Card rendering

Cards are drawn on a canvas by HearthSim's [Sunwell](https://github.com/HearthSim/Sunwell) (MIT, archived in 2022). Its frame images are in `public/sunwell/`, converted to WebP (15 MB down to 2 MB).

Sunwell is older than some of the game, so:
- **Locations** can't be drawn and are left out of the game.
- **Demon Hunter and multiclass cards** use the neutral frame. The class is shown in a chip under the card.
- **Newer tribes** such as Undead and Naga: we set the tribe banner text ourselves.
- **Spell schools** are shown in a chip under the card.
- **Fonts:** the real card fonts are proprietary, so Merriweather and Libre Franklin stand in.

Sunwell's `linebreak` dependency is overridden to 1.1.0 (the old version reads a file at runtime), and `src/polyfills.ts` provides `Buffer`.

Hearthstone is © Blizzard Entertainment. This is an unofficial fan project.
