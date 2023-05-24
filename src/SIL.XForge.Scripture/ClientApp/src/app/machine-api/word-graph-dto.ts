import { WordGraphArcDto } from './word-graph-arc-dto';

export interface WordGraphDto {
  sourceTokens: string[];
  initialStateScore: number;
  finalStates: number[];
  arcs: WordGraphArcDto[];
}
