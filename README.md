# HS Quiz

A browser quiz on Hearthstone cards.

- **Gauntlet:** each card has one attribute hidden (cost, attack, health, name, text, class, rarity, set, tribe or type). Fill it in. You have 3 lives; see how many cards you clear. Settings let you pick minions only or which attributes can be hidden.
- **Cardle:** a daily, Wordle-style puzzle. You only see the art and must guess every attribute in 6 tries. After each guess: 🟩 right, 🟨 close (numbers ±1, set from the same year, overlapping tribe/class, text ≥50% similar), ⬛ wrong. There is also an unlimited mode.

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

Hearthstone is © Blizzard Entertainment. This is an unofficial fan project.
