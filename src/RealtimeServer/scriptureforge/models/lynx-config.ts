export interface LynxConfig {
  autoCorrectionsEnabled: boolean;
  assessmentsEnabled: boolean;
  punctuationCheckerEnabled: boolean;
  allowedCharacterCheckerEnabled: boolean;
}

export interface LynxUserConfig {
  autoCorrectionsEnabled?: boolean;
  assessmentsEnabled?: boolean;
}
