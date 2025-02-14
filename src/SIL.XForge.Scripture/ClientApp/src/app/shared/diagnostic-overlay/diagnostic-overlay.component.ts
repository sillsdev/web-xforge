import { OverlayModule } from '@angular/cdk/overlay';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { DiagnosticOverlayService } from 'xforge-common/diagnostic-overlay.service';
import { LocalSettingsService } from 'xforge-common/local-settings.service';
import { NoticeService } from 'xforge-common/notice.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { L10nNumberPipe } from '../../../xforge-common/l10n-number.pipe';

export interface DiagnosticOverlayData {
  bookNum: number;
  chapterNum: number;
  projectId: string;
  isRightToLeft?: boolean;
  selectedText?: string;
}

const diagnosticOverlayCollapsedKey = 'DIAGNOSTIC_OVERLAY_COLLAPSED';

@Component({
  selector: 'app-diagnostic-overlay',
  templateUrl: './diagnostic-overlay.component.html',
  styleUrl: './diagnostic-overlay.component.scss',
  standalone: true,
  imports: [OverlayModule, CommonModule, UICommonModule]
})
export class DiagnosticOverlayComponent {
  isExpanded: boolean = true;
  isOpen: boolean = true;
  tab = 0;
  digestCycles = 0;

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly diagnosticOverlayService: DiagnosticOverlayService,
    readonly noticeService: NoticeService,
    private readonly localSettings: LocalSettingsService,
    private readonly l10nNumber: L10nNumberPipe
  ) {
    if (this.localSettings.get<boolean>(diagnosticOverlayCollapsedKey) === false) {
      this.isExpanded = false;
    }
  }

  get docCountsByCollection(): {
    [key: string]: { docs: number; subscribers: number; activeDocSubscriptionsCount: number };
  } {
    return this.realtimeService.docsCountByCollection;
  }

  get queriesByCollection(): { [key: string]: number } {
    return this.realtimeService.queriesByCollection;
  }

  get subscriberCountsByContext(): { [key: string]: { [key: string]: { all: number; active: number } } } {
    return this.realtimeService.subscriberCountsByContext;
  }

  get totalDocsCount(): number {
    return this.realtimeService.totalDocCount;
  }

  get digestCycleCounter(): string {
    this.digestCycles++;
    const displayElement = document.getElementById('digest-cycles');
    if (displayElement) displayElement.textContent = this.l10nNumber.transform(this.digestCycles);
    return '';
  }

  toggle(): void {
    this.isExpanded = !this.isExpanded;
    this.localSettings.set(diagnosticOverlayCollapsedKey, this.isExpanded);
  }

  close(): void {
    this.isOpen = false;
    this.diagnosticOverlayService.close();
    this.localSettings.remove(diagnosticOverlayCollapsedKey);
  }
}
