import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { FontService } from 'xforge-common/font.service';
import { I18nKey, I18nService } from 'xforge-common/i18n.service';
import { issuesEmailTemplate } from 'xforge-common/utils';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { ParatextService } from '../../core/paratext.service';
import { NoticeComponent } from '../../shared/notice/notice.component';

@Component({
    selector: 'app-font-unsupported-message',
    imports: [CommonModule, NoticeComponent, TranslocoModule],
    templateUrl: './font-unsupported-message.component.html',
    styleUrl: './font-unsupported-message.component.scss'
})
export class FontUnsupportedMessageComponent {
  constructor(
    private readonly fontService: FontService,
    private readonly activatedProjectService: ActivatedProjectService,
    readonly i18n: I18nService,
    readonly externalUrlService: ExternalUrlService
  ) {}

  suggestedRemedy = this.i18n.interpolate(this.suggestedRemedyI18nKey);

  get showUnsupportedFontWarning(): boolean {
    return !this.fontService.isFontFullySupported(this.selectedFont ?? '');
  }

  get showGraphiteWarning(): boolean {
    return this.fontService.isGraphiteFont(this.selectedFont ?? '');
  }

  get projectDoc(): SFProjectProfileDoc | undefined {
    return this.activatedProjectService.projectDoc;
  }

  get issueMailTo(): string {
    return issuesEmailTemplate();
  }

  get selectedFont(): string | undefined {
    return this.projectDoc?.data?.defaultFont;
  }

  get fallbackFont(): string {
    // This is not entirely correct logic. What it doesn't handle is when the selected font isn't a Graphite font, but
    // the default font for the writing system is a Graphite font. That would require a different message this component
    // doesn't currently display, stating that the selected font is not supported, but it will fall back to one font in
    // browsers that support Graphite, and another font in browsers that don't.
    return this.fontService.isGraphiteFont(this.selectedFont ?? '')
      ? this.fontService.nonGraphiteFallback(this.selectedFont ?? '')
      : this.fontService.getFontFamilyFromProject(this.projectDoc);
  }

  get warningI18nKey(): I18nKey {
    return this.showGraphiteWarning
      ? 'font_unsupported_message.warn_font_requires_graphite'
      : 'font_unsupported_message.warn_font_unsupported';
  }

  get suggestedRemedyI18nKey(): I18nKey {
    if (this.projectDoc?.data != null && ParatextService.isResource(this.projectDoc.data.paratextId)) {
      return 'font_unsupported_message.contact_for_help';
    } else {
      return 'font_unsupported_message.change_font_or_contact_for_help';
    }
  }
}
