import { TranslationSources } from '@sillsdev/machine';
import { AlignedWordPairDto } from './aligned-word-pair-dto';
import { RangeDto } from './range-dto';

export interface WordGraphArcDto {
  prevState: number;
  nextState: number;
  score: number;
  words: string[];
  confidences: number[];
  sourceSegmentRange: RangeDto;
  alignment: AlignedWordPairDto[];
  sources: TranslationSources[];
}
