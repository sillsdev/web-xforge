import { InputSystem } from '../../common/models/input-system';

export interface TranslateConfig {
  translationSuggestionsEnabled: boolean;
  source?: TranslateSource;
}

export interface TranslateSource {
  paratextId: string;
  name: string;
  inputSystem: InputSystem;
}
