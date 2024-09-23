import { OverlayModule } from '@angular/cdk/overlay';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RealtimeService } from 'xforge-common/realtime.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { DialogService } from 'xforge-common/dialog.service';

export interface DiagnosticOverlayData {
  bookNum: number;
  chapterNum: number;
  projectId: string;
  isRightToLeft?: boolean;
  selectedText?: string;
}

@Component({
  selector: 'app-diagnostic-overlay',
  templateUrl: './diagnostic-overlay.component.html',
  styleUrl: './diagnostic-overlay.component.scss',
  standalone: true,
  imports: [OverlayModule, CommonModule, UICommonModule]
})
export class DiagnosticOverlayComponent extends SubscriptionDisposable {
  isExpanded: boolean = true;
  isOpen: boolean = true;

  constructor(
    private readonly realtimeService: RealtimeService,
    private readonly dialogService: DialogService
  ) {
    super();
  }

  get docCountsByCollection(): { [key: string]: number } {
    return this.realtimeService.docsCountByCollection;
  }

  get totalDocsCount(): number {
    return this.realtimeService.totalDocCount;
  }

  toggle(): void {
    this.isExpanded = !this.isExpanded;
  }

  close(): void {
    this.isOpen = false;
    this.dialogService.closeDiagnosticOverlay();
  }
}
