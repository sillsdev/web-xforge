import { Component } from '@angular/core';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
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
  showDiagnosticOverlay: boolean = false;
  isExpanded: boolean = false;

  constructor(
    readonly featureFlags: FeatureFlagService,
    private readonly realtimeService: RealtimeService
  ) {
    super();
    this.featureFlags.showDiagnosticOverlay.enabled$.subscribe(isEnabled => {
      this.showDiagnosticOverlay = isEnabled;
      this.isExpanded = isEnabled;
    });
  }

  get showDocCollections(): { [key: string]: number } {
    return this.realtimeService.docCollection;
  }

  get totalDocsCount(): number {
    return this.realtimeService.totalDocCount;
  }

  onToggle(): void {
    this.isExpanded = !this.isExpanded;
  }
}
