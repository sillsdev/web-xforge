import { Injectable } from '@angular/core';
import { Delta } from 'quill';
import { I18nService } from 'xforge-common/i18n.service';

@Injectable({
  providedIn: 'root'
})
export class EditorHistoryService {
  constructor(private readonly i18n: I18nService) {}

  /**
   * Formats a revision timestamp the same way as everywhere else revisions are shown (i.e. the history and draft
   * selectors), so that dates always appear in the locale's format and always include the year.
   * @param timestamp The timestamp to format.
   * @param showTime Whether to include the time of day, as well as the date.
   */
  formatTimestamp(timestamp: string | null | undefined, showTime: boolean = false): string {
    if (timestamp == null || timestamp === '') {
      return 'Invalid Date';
    }

    return this.i18n.formatDate(new Date(timestamp), { showTime, showTimeZone: false });
  }

  processDiff(deltaA: Delta, deltaB: Delta): Delta {
    // Remove the cid whenever it is found, as this is confusing the diff
    deltaA.forEach(obj => this.removeCid(obj));
    deltaB.forEach(obj => this.removeCid(obj));

    const diff: Delta = deltaA.diff(deltaB);

    // Process each op in the diff
    for (const op of diff.ops ?? []) {
      if (op.hasOwnProperty('insert')) {
        // Color insertions as green
        op.attributes = {
          'insert-segment': true
        };
      } else if (op.hasOwnProperty('delete')) {
        // Color deletions red and strikethrough
        op.retain = op.delete;
        delete op.delete;
        op.attributes = {
          'delete-segment': true
        };
      }
    }

    return diff;
  }

  removeCid(obj: any): void {
    if (obj.cid != null) delete obj.cid;
    for (const subObj in obj) {
      if (typeof obj[subObj] === 'object' && obj[subObj] != null) this.removeCid(obj[subObj]);
    }
  }
}
