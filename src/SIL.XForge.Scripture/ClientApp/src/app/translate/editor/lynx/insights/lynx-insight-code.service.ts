import { Inject, Injectable } from '@angular/core';
import { EDITOR_INSIGHT_CODES, LynxInsightCode } from './lynx-insight-codes';

@Injectable({
  providedIn: 'root'
})
export class LynxInsightCodeService {
  constructor(@Inject(EDITOR_INSIGHT_CODES) private codes: Map<string, LynxInsightCode>) {}

  // TODO: send locale to server along with code
  lookupCode(code: string, localeCode: string): LynxInsightCode | undefined {
    return this.codes.get(code);
  }
}
