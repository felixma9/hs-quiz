/**
 * How much of each side of a card's art is padding (scripts/measure-art.py).
 * Fetched once and shared by the round art thumbnails and the card renderer.
 */
let artCrop: Promise<Record<string, number>> | null = null;
export function loadArtCrop(): Promise<Record<string, number>> {
  artCrop ??= fetch(`${import.meta.env.BASE_URL}art-crop.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return artCrop;
}
