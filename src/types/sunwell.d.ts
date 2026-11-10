declare module 'sunwell/dist/sunwell.web.js' {
  interface Gem {
    textSize: number;
  }
  interface RaceBanner {
    sunwell: { drawImage(ctx: CanvasRenderingContext2D, asset: string, coords: Record<string, number>): void };
    render(ctx: CanvasRenderingContext2D, ratio: number): void;
  }
  export interface SunwellCard {
    raceText: string;
    raceBannerAsset: string;
    raceBannerCoords: Record<string, number>;
    raceTextCoords: Record<string, number>;
    target: unknown;
    raceBanner?: RaceBanner;
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
