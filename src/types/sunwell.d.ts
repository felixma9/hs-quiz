declare module 'sunwell/dist/sunwell.web.js' {
  interface Gem {
    textSize: number;
  }
  interface SunwellCard {
    raceText: string;
    raceBannerAsset: string;
    raceBannerCoords: Record<string, number>;
    raceTextCoords: Record<string, number>;
    target: unknown;
    baseCardFrameAsset: string;
    getCardFrameAsset(): string;
    costGem?: Gem;
    attackGem?: Gem;
    healthGem?: Gem;
  }
  export default class Sunwell {
    constructor(options: Record<string, unknown>);
    options: Record<string, unknown>;
    getAssetPath(key: string): string;
    fetchAsset(path: string): Promise<unknown>;
    createCard(
      props: Record<string, unknown>,
      width: number,
      premium: boolean,
      target: HTMLCanvasElement,
      callback?: (canvas: HTMLCanvasElement) => void,
    ): SunwellCard;
  }
}
