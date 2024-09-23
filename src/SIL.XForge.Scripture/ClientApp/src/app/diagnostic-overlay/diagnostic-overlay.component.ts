import { Component, EventEmitter, Output } from '@angular/core';
import { RealtimeService } from 'xforge-common/realtime.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';

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
  styleUrl: './diagnostic-overlay.component.scss'
})
export class DiagnosticOverlayComponent extends SubscriptionDisposable {
  @Output() toggleOverlay = new EventEmitter<boolean>();
  isExpanded: boolean = true;

  constructor(private readonly realtimeService: RealtimeService) {
    super();
  }

  get showDocCollections(): { [key: string]: number } {
    return this.realtimeService.docCollection;
  }

  get totalDocsCount(): number {
    return this.realtimeService.totalDocCount;
  }

  onToggle(): void {
    this.isExpanded = !this.isExpanded;
    this.toggleOverlay.emit(this.isExpanded);
  }
}
