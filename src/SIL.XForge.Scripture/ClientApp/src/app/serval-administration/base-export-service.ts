import { NormalizedDateRange } from './date-range-picker.component';

/**
 * Base Service for exporting draft jobs data to CSV, TSV, and RSV formats.
 */
export abstract class BaseExportService {
  /**
   * Returns export filename using current date range, formatted as {prefix}_YYYY-MM-DD_YYYY-MM-DD.{ext}
   */
  protected getExportFilename(dateRange: NormalizedDateRange | undefined, ext: string, filenamePrefix: string): string {
    const startStr = dateRange == null ? '' : '_' + this.formatDateForExport(dateRange.start);
    const endStr = dateRange == null ? '' : '_' + this.formatDateForExport(dateRange.end);
    return `${filenamePrefix}${startStr}${endStr}.${ext}`;
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
}
