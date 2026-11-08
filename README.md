# HS Quiz

A browser quiz on Hearthstone cards.

Cards are drawn with in-game frames, with the fields you have to guess left blank. You fill them in on the card itself: tap the frame to cycle classes (or pick from the class list), tap the rarity gem to cycle rarities, and tap the cost, attack or health gem, the name banner, the text box or the tribe banner to type or choose. Your answers are drawn onto the card as you go. The class badges in the picker are simple original stand-ins, not the game's class icons.

- **Gauntlet:** each card has one field blank (cost, attack, health, name, text, class, rarity or tribe). Fill it in. You have 3 lives; see how many cards you clear. Settings let you pick minions only or which fields can be blank.
- **Cardle:** a daily, Wordle-style puzzle. You see the art and the frame, and fill in the rest of the card in 6 tries. After each guess: 🟩 right (it appears on the card), 🟨 close (numbers ±1, overlapping tribe/class, text ≥50% similar), ⬛ wrong. There is also an unlimited mode.
- **Card sets:** choose which sets cards come from on the main menu (saved on your device; new expansions start switched on).

Card text is free-typed and fuzzy graded. It counts as right when at least 85% of the words match in order **and** the numbers are exactly right. Names allow a typo or two.

Play it at https://felixma9.github.io/hs-quiz/ (the `gh-pages` branch holds the built site; run `npm run deploy` to update it).

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # grading + data pipeline tests
npm run build      # static site in dist/
```

## Card data

`public/cards.json` is built from [HearthstoneJSON](https://hearthstonejson.com) by `npm run cards`. Rerun it after a new expansion. It keeps collectible minions, spells, weapons, heroes and locations, drops Core/Vanilla reprints in favor of the original card, and cleans the text markup. If the script warns about new set codes, add them to `src/data/sets.ts`.

Art is loaded from `art.hearthstonejson.com` (art only, so it doesn't give the answers away).

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
