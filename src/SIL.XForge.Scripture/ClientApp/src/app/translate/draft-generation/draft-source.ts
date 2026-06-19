import { uniqBy } from 'lodash-es';
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

/** Copyright banner (and optional notice) for a draft source project. */
export interface CopyrightMessage {
  banner: string;
  notice?: string;
}

/** The distinct copyright messages across the given sources, deduplicated by banner text. */
export function getCopyrightMessages(
  sources: { copyrightBanner?: string; copyrightNotice?: string }[]
): CopyrightMessage[] {
  return uniqBy(
    sources
      .filter(source => source.copyrightBanner != null)
      .map(source => ({ banner: source.copyrightBanner!, notice: source.copyrightNotice })),
    message => message.banner
  );
}

export interface DraftSourcesAsArrays {
  trainingSources: DraftSource[];
  trainingTargets: DraftSource[];
  draftingSources: DraftSource[];
}
