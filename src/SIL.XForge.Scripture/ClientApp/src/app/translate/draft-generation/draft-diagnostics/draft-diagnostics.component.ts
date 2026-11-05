import { Component, Input } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { I18nService } from 'xforge-common/i18n.service';
import { BuildDto, ServalBuildDiagnostic, ServalDiagnosticCode } from '../../../machine-api/build-dto';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { DisplayConfidenceComponent } from '../build-confidences/display-confidence.component';

@Component({
  selector: 'app-draft-diagnostics',
  templateUrl: './draft-diagnostics.component.html',
  styleUrl: './draft-diagnostics.component.scss',
  imports: [DisplayConfidenceComponent, NoticeComponent, TranslocoModule]
})
/**
 * Displays the supported draft diagnostics in an human-friendly format.
 */
export class DraftDiagnosticsComponent {
  constructor(
    private readonly i18n: I18nService,
    protected readonly urlService: ExternalUrlService
  ) {}

  @Input() build: BuildDto | undefined;

  get booksWithLowConfidence(): number {
    return (
      this.build?.executionData?.diagnostics?.filter(d => d.code === ServalDiagnosticCode.LowConfidence).length ?? 0
    );
  }

  get tooFewSegmentsSelectedForTraining(): ServalBuildDiagnostic | undefined {
    return this.build?.executionData?.diagnostics?.find(
      d => d.code === ServalDiagnosticCode.TooFewSegmentsSelectedForTraining
    );
  }

  get lowConfidenceBookName(): string | undefined {
    const bookId: string | undefined = this.build?.executionData?.diagnostics?.find(
      d => d.code === ServalDiagnosticCode.LowConfidence
    )?.data?.bookId;
    if (bookId != null) {
      return this.i18n.localizeBook(bookId);
    } else {
      return undefined;
    }
  }

  get showLowConfidenceDiagnostic(): boolean {
    return this.booksWithLowConfidence > 0;
  }
}
