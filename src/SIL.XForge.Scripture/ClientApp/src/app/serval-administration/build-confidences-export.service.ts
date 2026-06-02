import { Injectable } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';
import { BookConfidence, ChapterConfidence } from '../translate/draft-generation/build-confidences/build-confidences';
import { BaseExportService } from './base-export-service';
import { NormalizedDateRange } from './date-range-picker.component';
import { encodeRsv } from './rsv';

interface BookConfidenceRow {
  Book: string;
  'Projected chrF3': string;
  Usability: string;
  Label: string;
  Confidence: string;
}

interface ChapterConfidenceRow {
  Book: string;
  Chapter: string;
  'Projected chrF3': string;
  Usability: string;
  Label: string;
  Confidence: string;
}

/**
 * Service for exporting draft jobs data to CSV and RSV formats.
 * Handles the transformation of table rows to spreadsheet format and file generation.
 */
@Injectable({
  providedIn: 'root'
})
export class BuildConfidencesExportService extends BaseExportService {
  /**
   * Export the build confidences data as a CSV file.
   */
  exportCsv(
    rows: (BookConfidence | ChapterConfidence)[],
    dateRangeForFilename: NormalizedDateRange | undefined,
    filenamePrefix: string | undefined = undefined
  ): void {
    this.exportSeparatedValues(rows, dateRangeForFilename, filenamePrefix, 'csv', ',', 'text/csv');
  }

  /**
   * Export the build confidences data as a TSV file.
   */
  exportTsv(
    rows: BookConfidence[] | ChapterConfidence[],
    dateRangeForFilename: NormalizedDateRange | undefined,
    filenamePrefix: string | undefined = undefined
  ): void {
    this.exportSeparatedValues(rows, dateRangeForFilename, filenamePrefix, 'tsv', '\t', 'text/tab-separated-values');
  }

  /**
   * Export the build confidences data as an RSV (Rows of String Values) file.
   */
  exportRsv(
    rows: (BookConfidence | ChapterConfidence)[],
    dateRangeForFilename: NormalizedDateRange | undefined,
    filenamePrefix: string | undefined = undefined
  ): void {
    const allRows: (string | null)[][] = this.createRsvRows(rows);

    // Encode to RSV format
    const rsvData: Uint8Array = encodeRsv(allRows);

    // Create filename and download
    const filename: string = this.getExportFilename(
      dateRangeForFilename,
      'rsv',
      this.getFileNamePrefix(rows, filenamePrefix)
    );
    const blob: Blob = new Blob([rsvData as BlobPart], { type: 'application/octet-stream' });
    saveAs(blob, filename);
  }

  private createRsvRows(rows: (BookConfidence | ChapterConfidence)[]): string[][] {
    if (this.isChapterConfidenceArray(rows)) {
      const headers: string[] = ['Book', 'Chapter', 'Projected chrF3', 'Usability', 'Label'];
      const dataRows: string[][] = rows.map(row => [
        Canon.bookNumberToId(row.bookNum),
        row.chapterNum.toString(),
        row.projectedChrF3.toString(),
        row.usability.toString(),
        row.label ?? null
      ]);
      return [headers, ...dataRows];
    } else {
      const headers: string[] = ['Book', 'Projected chrF3', 'Usability', 'Label'];
      const dataRows: string[][] = rows.map(row => [
        Canon.bookNumberToId(row.bookNum),
        row.projectedChrF3.toString(),
        row.usability.toString(),
        row.label ?? null
      ]);
      return [headers, ...dataRows];
    }
  }

  private exportSeparatedValues(
    rows: (BookConfidence | ChapterConfidence)[],
    dateRangeForFilename: NormalizedDateRange | undefined,
    filenamePrefix: string | undefined,
    extension: string,
    delimiter: string,
    mimeType: string
  ): void {
    const spreadsheetRows: (BookConfidenceRow | ChapterConfidenceRow)[] = this.getSpreadsheetRows(rows);
    const separatedValues: string = Papa.unparse(spreadsheetRows, { delimiter: delimiter });
    const filename: string = this.getExportFilename(
      dateRangeForFilename,
      extension,
      this.getFileNamePrefix(rows, filenamePrefix)
    );
    const blob: Blob = new Blob([separatedValues], { type: mimeType });
    saveAs(blob, filename);
  }

  private getFileNamePrefix(rows: (BookConfidence | ChapterConfidence)[], filenamePrefix: string | undefined): string {
    return filenamePrefix ?? (this.isChapterConfidenceArray(rows) ? 'usability_chapters' : 'usability_books');
  }

  private getSpreadsheetRows(
    rows: BookConfidence[] | ChapterConfidence[]
  ): (BookConfidenceRow | ChapterConfidenceRow)[] {
    if (this.isChapterConfidenceArray(rows)) {
      return rows.map(row => ({
        Book: Canon.bookNumberToId(row.bookNum),
        Chapter: row.chapterNum.toString(),
        'Projected chrF3': row.projectedChrF3.toFixed(3),
        Usability: row.usability.toFixed(3),
        Label: row.label,
        Confidence: row.confidence.toFixed(3)
      }));
    } else {
      return rows.map(row => ({
        Book: Canon.bookNumberToId(row.bookNum),
        'Projected chrF3': row.projectedChrF3.toFixed(3),
        Usability: row.usability.toFixed(3),
        Label: row.label,
        Confidence: row.confidence.toFixed(3)
      }));
    }
  }

  private isChapterConfidenceArray(rows: (BookConfidence | ChapterConfidence)[]): rows is ChapterConfidence[] {
    return rows.length > 0 && 'chapterNum' in rows[0];
  }
}
