import { AlignedWordPairDto } from './aligned-word-pair-dto';
import { TranslationSource } from './translation-source';

export interface WordGraphArcDto {
  prevState: number;
  nextState: number;
  score: number;
  targetTokens: string[];
  confidences: number[];
  sourceSegmentStart: number;
  sourceSegmentEnd: number;
  alignment: AlignedWordPairDto[];
  sources: TranslationSource[][];
}
