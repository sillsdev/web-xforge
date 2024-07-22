import { Pipe, PipeTransform } from '@angular/core';
import { LynxInsightCodeService } from './lynx-insight-code.service';
import { LynxInsightCode } from './lynx-insight-codes';

@Pipe({
  name: 'insightCode'
})
export class InsightCodePipe implements PipeTransform {
  constructor(private codeService: LynxInsightCodeService) {}

  transform(code: string, locale: string, prop: keyof LynxInsightCode = 'description'): string {
    return this.codeService.lookupCode(code, locale)?.[prop] || code;
  }
}
