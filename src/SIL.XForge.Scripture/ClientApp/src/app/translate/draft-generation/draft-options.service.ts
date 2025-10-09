import { Injectable } from '@angular/core';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { BuildDto } from '../../machine-api/build-dto';

// Corresponds to Serval 1.11.0 release
export const FORMATTING_OPTIONS_SUPPORTED_DATE: Date = new Date('2025-09-25T00:00:00Z');

@Injectable({
  providedIn: 'root'
})
export class DraftOptionsService {
  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly featureFlags: FeatureFlagService
  ) {}

  areFormattingOptionsSelected(): boolean {
    return (
      !this.featureFlags.usfmFormat.enabled ||
      (this.activatedProjectService.projectDoc?.data?.translateConfig.draftConfig.usfmConfig?.paragraphFormat != null &&
        this.activatedProjectService.projectDoc?.data?.translateConfig.draftConfig.usfmConfig?.quoteFormat != null)
    );
  }

  areFormattingOptionsSupportedForBuild(entry: BuildDto | undefined): boolean {
    return this.featureFlags.usfmFormat.enabled && entry?.additionalInfo?.dateFinished != null
      ? new Date(entry.additionalInfo.dateFinished) > FORMATTING_OPTIONS_SUPPORTED_DATE
      : false;
  }
}
