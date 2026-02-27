import { Injectable } from '@angular/core';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { NormalizedDateRange } from './date-range-picker.component';
import { encodeRsv } from './rsv';

/** Set of strings representing a Serval build job, to include in an exported spreadsheet. This is somewhat of a
 * different kind of data set from `DraftJobsTableRow`, as it will be populated to represent and record an understanding
 * of status at a particular time, whereas the web page table rows represent a dashboard of inspectable status _now_.
 *
 * Some fields are of type string that one might normally expect to be another type, but that is because this is
 * preparing the data to export as strings. */
export interface SpreadsheetRow {
  servalBuildId?: string;
  /** To be populated with locale-less UTC timestamp. */
  startTime?: string;
  endTime?: string;
  /** Making this contain a single number (rather than a human-friendly formatted duration description) gives
   * flexibility for graphing. Minutes are used rather than hours since the Serval build time has continued to decrease.
   * */
  durationMinutes?: string;
  status: string;
  sfProjectId: string;
  projectName?: string;
  sfUserId?: string;
  trainingBooks: string;
  translationBooks: string;
}

/**
 * Service for exporting draft jobs data to CSV and RSV formats.
 * Handles the transformation of table rows to spreadsheet format and file generation.
 */
@Injectable({
  providedIn: 'root'
})
export class DraftJobsExportService {
  /**
   * Export the draft jobs data to a CSV file.
   */
  exportCsv(
    rows: SpreadsheetRow[],
    dateRangeForFilename: NormalizedDateRange,
    meanDuration: number,
    maxDuration: number,
    filenamePrefix: string
  ): void {
    const spreadsheetRows = this.addStatistics(rows, meanDuration, maxDuration);
    const csv: string = Papa.unparse(spreadsheetRows);
    const filename: string = this.getExportFilename(dateRangeForFilename, 'csv', filenamePrefix);
    const blob: Blob = new Blob([csv], { type: 'text/csv' });
    saveAs(blob, filename);
  }

  /**
   * Export the draft jobs data to an RSV (Rows of String Values) file.
   */
  exportRsv(
    rows: SpreadsheetRow[],
    dateRangeForFilename: NormalizedDateRange,
    meanDuration: number,
    maxDuration: number,
    filenamePrefix: string
  ): void {
    const spreadsheetRows = this.addStatistics(rows, meanDuration, maxDuration);

    // Convert SpreadsheetRow objects to (string | null)[][] format for RSV
    // First row is headers
    const headers: string[] = [
      'servalBuildId',
      'startTime',
      'endTime',
      'durationMinutes',
      'status',
      'sfProjectId',
      'projectName',
      'sfUserId',
      'trainingBooks',
      'translationBooks'
    ];

    const dataRows: (string | null)[][] = spreadsheetRows.map(row => [
      row.servalBuildId ?? null,
      row.startTime ?? null,
      row.endTime ?? null,
      row.durationMinutes ?? null,
      row.status,
      row.sfProjectId,
      row.projectName ?? null,
      row.sfUserId ?? null,
      row.trainingBooks,
      row.translationBooks
    ]);

    // Combine headers and data
    const allRows: (string | null)[][] = [headers, ...dataRows];

    // Encode to RSV format
    const rsvData: Uint8Array = encodeRsv(allRows);

    // Create filename and download
    const filename: string = this.getExportFilename(dateRangeForFilename, 'rsv', filenamePrefix);
    const blob: Blob = new Blob([rsvData as BlobPart], { type: 'application/octet-stream' });
    saveAs(blob, filename);
  }

  /**
   * Returns a copy of the rows with appended statistics (mean and max duration).
   */
  protected addStatistics(rows: SpreadsheetRow[], meanDuration: number, maxDuration: number): SpreadsheetRow[] {
    const result: SpreadsheetRow[] = [...rows];
    // Append blank row
    const blankRow: SpreadsheetRow = {
      status: '',
      sfProjectId: '',
      trainingBooks: '',
      translationBooks: ''
    };
    result.push(blankRow);

    // Append mean duration row. This is not in a 'correct column', but puts some desired data into the output.
    const meanRow: SpreadsheetRow = {
      servalBuildId: 'Mean successful duration minutes',
      startTime: meanDuration != null ? this.msToMinutes(meanDuration).toFixed(0) : '0',
      status: '',
      sfProjectId: '',
      trainingBooks: '',
      translationBooks: ''
    };
    result.push(meanRow);

    // Append max duration row
    const maxRow: SpreadsheetRow = {
      servalBuildId: 'Max all durations minutes',
      startTime: maxDuration != null ? this.msToMinutes(maxDuration).toFixed(0) : '0',
      status: '',
      sfProjectId: '',
      trainingBooks: '',
      translationBooks: ''
    };
    result.push(maxRow);

    return result;
  }

  /**
   * Returns export filename using current date range, formatted as {prefix}_YYYY-MM-DD_YYYY-MM-DD.{ext}
   */
  private getExportFilename(dateRange: NormalizedDateRange, ext: string, filenamePrefix: string): string {
    const startStr = this.formatDateForExport(dateRange.start);
    const endStr = this.formatDateForExport(dateRange.end);
    return `${filenamePrefix}_${startStr}_${endStr}.${ext}`;
  }

  /**
   * Formats a Date as YYYY-MM-DD (no time)
   */
  private formatDateForExport(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Converts milliseconds to minutes
   */
  private msToMinutes(milliseconds: number): number {
    return milliseconds / 1000 / 60;
  }
}
