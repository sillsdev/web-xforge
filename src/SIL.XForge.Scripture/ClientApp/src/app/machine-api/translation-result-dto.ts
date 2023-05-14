import { AlignedWordPairDto } from './aligned-word-pair-dto';
import { PhraseDto } from './phrase-dto';
import { TranslationSource } from './translation-source';

export interface TranslationResultDto {
  translation: string;
  sourceTokens: string[];
  targetTokens: string[];
  confidences: number[];
  sources: TranslationSource[][];
  alignment: AlignedWordPairDto[];
  phrases: PhraseDto[];
}
