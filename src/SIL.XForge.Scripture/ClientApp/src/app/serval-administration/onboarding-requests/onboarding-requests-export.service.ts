import { Injectable } from '@angular/core';
import Papa from 'papaparse';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { UserService } from 'xforge-common/user.service';
import { isPopulatedString } from '../../../type-utils';
import { parseDate } from '../../shared/utils';
import {
  OnboardingRequest,
  OnboardingRequestService
} from '../../translate/draft-generation/onboarding-request.service';
import { ServalAdministrationService } from '../serval-administration.service';

const ONBOARDING_REQUESTS_SPREADSHEET_HEADINGS = [
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

type OnboardingRequestSpreadsheetHeading = (typeof ONBOARDING_REQUESTS_SPREADSHEET_HEADINGS)[number];

/**
 * Represents a single onboarding request row to be exported to a spreadsheet.
 */
type OnboardingRequestSpreadsheetRow = Record<OnboardingRequestSpreadsheetHeading, string>;

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

  private transformSpreadsheetRowsForExport(rows: OnboardingRequestSpreadsheetRow[]): string[][] {
    return rows.map(row => {
      return ONBOARDING_REQUESTS_SPREADSHEET_HEADINGS.map(heading => row[heading] ?? '');
    });
  }

  private async createSeparatedValues(requests: OnboardingRequest[], delimiter: string): Promise<string> {
    const assigneeNames = await this.lookupAssigneeNames(requests);

    const spreadsheetRows: OnboardingRequestSpreadsheetRow[] = await Promise.all(
      requests.map(async request => this.createSpreadsheetRow(request, assigneeNames))
    );

    const dataRows: string[][] = this.transformSpreadsheetRowsForExport(spreadsheetRows);

    return Papa.unparse(
      { fields: [...ONBOARDING_REQUESTS_SPREADSHEET_HEADINGS], data: dataRows },
      { delimiter: delimiter, escapeFormulae: true }
    );
  }

  private async createSpreadsheetRow(
    request: OnboardingRequest,
    assigneeNames: Map<string, string>
  ): Promise<OnboardingRequestSpreadsheetRow> {
    const sfProjectId = request.submission.projectId;
    const projectDocSubscription = new DocSubscription('OnboardingRequestsExportService.createSpreadsheetRow');
    const projectDoc = await this.servalAdministrationService.subscribe(sfProjectId, projectDocSubscription);
    projectDocSubscription.unsubscribe();
    const projectShortName = projectDoc?.data?.shortName ?? sfProjectId;

    return {
      request_date_utc: this.formatRequestDateUtc(request.submission.timestamp) ?? '',
      resolution: this.onboardingRequestService.getResolution(request.resolution).label,
      requester: request.submission.formData.name,
      language_code: request.submission.formData.translationLanguageIsoCode,
      project_shortname: projectShortName,
      language_name: request.submission.formData.translationLanguageName,
      assignee: assigneeNames.get(request.assigneeId) ?? '',
      request_id: request.id,
      sf_project_id: sfProjectId
    };
  }

  /** Resolves the display name for each unique populated SF assignee user ID. */
  private async lookupAssigneeNames(requests: OnboardingRequest[]): Promise<Map<string, string>> {
    const assigneeIds = [...new Set(requests.map(request => request.assigneeId).filter(isPopulatedString))];
    const entries = await Promise.all(
      assigneeIds.map(async assigneeId => {
        const docSubscription = new DocSubscription('OnboardingRequestsExportService.lookupAssigneeNames');
        const userDoc = await this.userService.get(assigneeId, docSubscription);
        docSubscription.unsubscribe();
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
