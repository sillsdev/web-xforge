/* HelpHero typings */
export declare type HEventKind =
  | 'tour_started'
  | 'tour_completed'
  | 'tour_advanced'
  | 'tour_cancelled'
  | 'tour_interrupted'
  | 'error';
export declare type HEvent = {
  kind: HEventKind;
  details?: string;
  tourId?: string;
  stepId?: string;
};
export declare type HStep = {
  id: string;
  name: string;
};
export declare type HTour = {
  id: string;
  name: string;
  steps: HStep[];
};
export declare type HEventInfo = {
  tour?: HTour;
  step?: HStep;
};
export declare type HData = {
  [key: string]: boolean | number | string | undefined | null;
};
export declare type HelpHero = {
  startTour: (
    id: string,
    options?: {
      skipIfAlreadySeen: boolean;
    }
  ) => void;
  advanceTour: () => void;
  cancelTour: () => void;
  identify: (id: string | number, data?: HData) => void;
  update: (data: HData | ((data: HData) => HData | null | undefined)) => void;
  anonymous: () => void;
  on: (kind: HEventKind, fn: (ev: HEvent, info: HEventInfo) => void) => void;
  off: (kind: HEventKind, fn: (ev: HEvent, info: HEventInfo) => void) => void;
  openLauncher: () => void;
  closeLauncher: () => void;
};
export {};
