import { Injectable } from '@angular/core';
import Papa from 'papaparse';
import { UserService } from 'xforge-common/user.service';
import { isPopulatedString } from '../../../type-utils';
import { parseDate } from '../../shared/utils';
import {
  OnboardingRequest,
  OnboardingRequestService
} from '../../translate/draft-generation/onboarding-request.service';
import { ServalAdministrationService } from '../serval-administration.service';

/** Column headers for the onboarding requests export, in the order they appear in the exported file. */
export const ONBOARDING_REQUESTS_EXPORT_HEADERS = [
  'request_date_utc',
  'resolution',
  'requester',
  'language_code',
  'project_shortname',
  'language_name',
  'assignee',
  'request_id',
  'sf_project_id'
] as const;

/**
 * Builds spreadsheet exports of onboarding requests.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingRequestsExportService {
  constructor(
    private readonly onboardingRequestService: OnboardingRequestService,
    private readonly userService: UserService,
    private readonly servalAdministrationService: ServalAdministrationService
  ) {}

  /** Builds a comma-separated values (CSV) string for the given onboarding requests. */
  createCsv(requests: OnboardingRequest[]): Promise<string> {
    return this.createSeparatedValues(requests, ',');
  }

  /** Builds a tab-separated values (TSV) string for the given onboarding requests. */
  createTsv(requests: OnboardingRequest[]): Promise<string> {
    return this.createSeparatedValues(requests, '\t');
  }

  /**
   * Builds the export filename, e.g. onboarding-requests_2026-02-28_182359Z.tsv. The date and
   * time are in UTC; the trailing 'Z' indicates this is UTC rather than the user's local time. The time is included
   * because the exportable data will change during the day, and UTC is used both because the files can be shared across
   * timezones and because the records in the file also have UTC timestamps.
   */
  exportFilename(extension: string, date: Date = new Date()): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `onboarding-requests_${year}-${month}-${day}_${hours}${minutes}${seconds}Z.${extension}`;
  }

  private async createSeparatedValues(requests: OnboardingRequest[], delimiter: string): Promise<string> {
    const assigneeNames = await this.lookupAssigneeNames(requests);

    const data: string[][] = await Promise.all(
      requests.map(async request => {
        const sfProjectId = request.submission.projectId;
        const projectDoc = await this.servalAdministrationService.get(sfProjectId);
        const projectShortName = projectDoc?.data?.shortName ?? sfProjectId;
        return [
          this.formatRequestDateUtc(request.submission.timestamp) ?? '',
          this.onboardingRequestService.getResolution(request.resolution).label,
          request.submission.formData.name,
          request.submission.formData.translationLanguageIsoCode,
          projectShortName,
          request.submission.formData.translationLanguageName,
          assigneeNames.get(request.assigneeId) ?? '',
          request.id,
          sfProjectId
        ];
      })
    );

    return Papa.unparse(
      { fields: [...ONBOARDING_REQUESTS_EXPORT_HEADERS], data },
      { delimiter: delimiter, escapeFormulae: true }
    );
  }

  /** Resolves the display name for each unique populated SF assignee user ID. */
  private async lookupAssigneeNames(requests: OnboardingRequest[]): Promise<Map<string, string>> {
    const assigneeIds = [...new Set(requests.map(request => request.assigneeId).filter(isPopulatedString))];
    const entries = await Promise.all(
      assigneeIds.map(async assigneeId => {
        const userDoc = await this.userService.get(assigneeId);
        return [assigneeId, userDoc?.data?.displayName ?? ''] as const;
      })
    );
    return new Map(entries);
  }

  /** Formats a request timestamp as an ISO 8601 UTC string with no timezone marker, if valid. The
   * timezone marker ('Z') is removed so spreadsheet software can interpret the value as a date rather than as a string.
   * */
  private formatRequestDateUtc(timestamp: string | undefined): string | undefined {
    const date: Date | undefined = parseDate(timestamp);
    return date == null ? undefined : date.toISOString().replace(/Z$/, '');
  }
}
