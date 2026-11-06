import { OverlayModule } from '@angular/cdk/overlay';
import { KeyValuePipe } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { DiagnosticOverlayService } from 'xforge-common/diagnostic-overlay.service';
import { L10nNumberPipe } from 'xforge-common/l10n-number.pipe';
import { LocalSettingsService } from 'xforge-common/local-settings.service';
import { NoticeService } from 'xforge-common/notice.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { FeedbackNoticeDurations, FeedbackNoticeTimingService } from '../user-feedback/feedback-notice-timing.service';

export interface DiagnosticOverlayData {
  bookNum: number;
  chapterNum: number;
  projectId: string;
  isRightToLeft?: boolean;
  selectedText?: string;
}

const diagnosticOverlayCollapsedKey = 'DIAGNOSTIC_OVERLAY_COLLAPSED';
const diagnosticOverlayTabKey = 'DIAGNOSTIC_OVERLAY_TAB';

type DiagnosticOverlayTab = 'realtime' | 'loading' | 'feedback';

@Component({
  selector: 'app-diagnostic-overlay',
  templateUrl: './diagnostic-overlay.component.html',
  styleUrl: './diagnostic-overlay.component.scss',
  imports: [OverlayModule, KeyValuePipe, FormsModule, MatIconButton, MatIcon, L10nNumberPipe]
})
export class DiagnosticOverlayComponent {
  isExpanded: boolean = true;
  isOpen: boolean = true;
  tab: DiagnosticOverlayTab = 'realtime';
  readonly tabs: { id: DiagnosticOverlayTab; label: string }[] = [
    { id: 'realtime', label: 'Realtime docs' },
    { id: 'loading', label: 'Loading' },
    { id: 'feedback', label: 'Feedback' }
  ];
  readonly draftingFeedbackNoticeDurationLabels: { key: keyof FeedbackNoticeDurations; label: string }[] = [
    { key: 'usageBeforeAsking', label: 'Drafting before asking' },
    { key: 'hiddenAfterDismissal', label: 'Hidden after dismissing' },
    { key: 'hiddenAfterSubmission', label: 'Hidden after sending feedback' }
  ];

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly diagnosticOverlayService: DiagnosticOverlayService,
    readonly noticeService: NoticeService,
    readonly feedbackNoticeTiming: FeedbackNoticeTimingService,
    private readonly localSettings: LocalSettingsService
  ) {
    if (this.localSettings.get<boolean>(diagnosticOverlayCollapsedKey) === false) {
      this.isExpanded = false;
    }
    const savedTab: DiagnosticOverlayTab | undefined =
      this.localSettings.get<DiagnosticOverlayTab>(diagnosticOverlayTabKey);
    if (savedTab != null && this.tabs.some(t => t.id === savedTab)) this.tab = savedTab;
  }

  get docCountsByCollection(): { [key: string]: { docs: number; subscribers: number; queries: number } } {
    return this.realtimeService.docsCountByCollection;
  }

  get totalDocsCount(): number {
    return this.realtimeService.totalDocCount;
  }

  selectTab(tab: DiagnosticOverlayTab): void {
    this.tab = tab;
    this.localSettings.set(diagnosticOverlayTabKey, tab);
  }

  /** Formats a duration as whole days when it is a whole number of days, and as minutes otherwise. */
  formatDuration(durationInMs: number): string {
    const minutes: number = durationInMs / (60 * 1000);
    const minutesPerDay = 24 * 60;
    return minutes % minutesPerDay === 0 ? `${minutes / minutesPerDay} days` : `${minutes} minutes`;
  }

  toggle(): void {
    this.isExpanded = !this.isExpanded;
    this.localSettings.set(diagnosticOverlayCollapsedKey, this.isExpanded);
  }

  close(): void {
    this.isOpen = false;
    this.diagnosticOverlayService.close();
    this.localSettings.remove(diagnosticOverlayCollapsedKey);
    this.localSettings.remove(diagnosticOverlayTabKey);
  }
}
