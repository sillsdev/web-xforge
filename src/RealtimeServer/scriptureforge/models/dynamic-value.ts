import { Value } from './value';

/*
  This interface indicates a value represented by text,
  audio, or both.
*/
export interface DynamicValue extends Value {
  audioUrl?: string;
}
