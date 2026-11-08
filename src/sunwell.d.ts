declare module 'sunwell/dist/sunwell.web.js' {
  interface SunwellCard {
    raceText: string;
    target: unknown;
  }
  export default class Sunwell {
    constructor(options: Record<string, unknown>);
    getAssetPath(key: string): string;
    createCard(
      props: Record<string, unknown>,
      width: number,
      premium: boolean,
      target: HTMLCanvasElement,
      callback?: (canvas: HTMLCanvasElement) => void,
    ): SunwellCard;
  }
}
