import { OverlayModule } from '@angular/cdk/overlay';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { DiagnosticOverlayService } from 'xforge-common/diagnostic-overlay.service';
import { LocalSettingsService } from 'xforge-common/local-settings.service';
import { NoticeService } from 'xforge-common/notice.service';
import { RealtimeService } from 'xforge-common/realtime.service';
import { UICommonModule } from 'xforge-common/ui-common.module';

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
    imports: [OverlayModule, CommonModule, UICommonModule]
})
export class DiagnosticOverlayComponent {
  isExpanded: boolean = true;
  isOpen: boolean = true;

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly diagnosticOverlayService: DiagnosticOverlayService,
    readonly noticeService: NoticeService,
    private readonly localSettings: LocalSettingsService
  ) {
    if (this.localSettings.get<boolean>(diagnosticOverlayCollapsedKey) === false) {
      this.isExpanded = false;
    }
  }

  get docCountsByCollection(): { [key: string]: { docs: number; subscribers: number; queries: number } } {
    return this.realtimeService.docsCountByCollection;
  }

  get totalDocsCount(): number {
    return this.realtimeService.totalDocCount;
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
