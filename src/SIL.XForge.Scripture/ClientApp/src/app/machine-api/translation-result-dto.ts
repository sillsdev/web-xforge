import { TranslationSources } from '@sillsdev/machine';
import { AlignedWordPairDto } from './aligned-word-pair-dto';
import { PhraseDto } from './phrase-dto';

export interface TranslationResultDto {
  translation: string;
  sourceTokens: string[];
  targetTokens: string[];
  confidences: number[];
  sources: TranslationSources[];
  alignment: AlignedWordPairDto[];
  phrases: PhraseDto[];
}
