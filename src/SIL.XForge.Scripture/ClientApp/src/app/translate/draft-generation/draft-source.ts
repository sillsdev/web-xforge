import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';

interface DraftTextInfo {
  bookNum: number;
}

export interface DraftSource extends TranslateSource {
  texts: DraftTextInfo[];
  noAccess?: boolean;
  copyrightBanner?: string;
  copyrightNotice?: string;
}

export interface DraftSourcesAsArrays {
  trainingSources: DraftSource[];
  trainingTargets: DraftSource[];
  draftingSources: DraftSource[];
}
