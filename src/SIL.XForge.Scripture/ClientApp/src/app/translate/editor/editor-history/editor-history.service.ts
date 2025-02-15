import { Injectable } from '@angular/core';
import { Delta } from 'quill';
import { I18nService } from 'xforge-common/i18n.service';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

@Injectable({
  providedIn: 'root'
})
export class EditorHistoryService {
  constructor(private readonly i18n: I18nService) {}

  formatTimestamp(timestamp: string | null | undefined, forceLong: boolean = false): string {
    if (timestamp != null) {
      const date = new Date(timestamp);
      const now = new Date();
      const weeksAgo26 = new Date(now.getTime() - MILLISECONDS_IN_A_DAY * 7 * 26);

      let options: Intl.DateTimeFormatOptions;

      // If the date is within the last 26 weeks (6 months) show month and day like 'Jan 5'
      if (!forceLong && date > weeksAgo26) {
        options = {
          month: 'short',
          day: 'numeric'
        };
      } else {
        // If the date is more than 26 weeks ago, or long date is forced, show month, day, and year (mm/dd/yy)
        options = {
          dateStyle: 'short'
        };
      }

      return date.toLocaleString(this.i18n.locale.canonicalTag, options).replace(/,/g, '');
    }

    return 'Invalid Date';
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
