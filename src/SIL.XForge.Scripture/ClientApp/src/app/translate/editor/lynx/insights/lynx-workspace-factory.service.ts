import { Injectable } from '@angular/core';
import { DocumentManager, Localizer, Workspace } from '@sillsdev/lynx';
import { ScriptureDeltaDocument, ScriptureDeltaEditFactory } from '@sillsdev/lynx-delta';
import { RuleType, StandardRuleSets } from '@sillsdev/lynx-punctuation-checker';
import Delta, { Op } from 'quill-delta';
import { LynxConfig } from 'realtime-server/lib/esm/scriptureforge/models/lynx-config';

/**
 * Factory service for creating Lynx workspaces with specific diagnostic providers based on project settings.
 */
@Injectable({
  providedIn: 'root'
})
export class LynxWorkspaceFactory {
  /**
   * Creates a workspace configured for the given settings.
   * @param documentManager The document manager instance
   * @param lynxSettings The current Lynx configuration settings
   * @returns A workspace configured with the appropriate diagnostic providers
   */
  createWorkspace(
    documentManager: DocumentManager<ScriptureDeltaDocument, Op, Delta>,
    lynxSettings: LynxConfig
  ): Workspace<Op> {
    const localizer = new Localizer();
    const editFactory = new ScriptureDeltaEditFactory();
    const enabledRuleTypes: RuleType[] = [];

    if (lynxSettings.assessmentsEnabled) {
      if (lynxSettings.punctuationCheckerEnabled) {
        enabledRuleTypes.push(RuleType.QuotationMarkPairing);
        enabledRuleTypes.push(RuleType.PairedPunctuation);
        enabledRuleTypes.push(RuleType.PunctuationContext);
      }

      if (lynxSettings.allowedCharacterCheckerEnabled) {
        enabledRuleTypes.push(RuleType.AllowedCharacters);
      }
    }

    // Create diagnostic providers based on enabled rule types
    const diagnosticProviders =
      enabledRuleTypes.length > 0
        ? StandardRuleSets.English.createSelectedDiagnosticProviders(
            localizer,
            documentManager,
            editFactory,
            enabledRuleTypes,
            true
          )
        : [];

    const onTypeFormattingProviders = lynxSettings.autoCorrectionsEnabled
      ? StandardRuleSets.English.createOnTypeFormattingProviders(documentManager, editFactory)
      : [];

    // Create the workspace with the selected providers
    return new Workspace<Op>({
      localizer,
      diagnosticProviders,
      onTypeFormattingProviders
    });
  }
}
