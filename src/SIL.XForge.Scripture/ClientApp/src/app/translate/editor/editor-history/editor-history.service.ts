import { Injectable } from '@angular/core';
import { DeltaStatic } from 'quill';
import { I18nService } from 'xforge-common/i18n.service';

const MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

@Injectable({
  providedIn: 'root'
})
export class EditorHistoryService {
  constructor(private readonly i18n: I18nService) {}

  formatTimestamp(timestamp: string | null | undefined): string {
    if (timestamp != null) {
      const date = new Date(timestamp);
      const now = new Date();
      const twoWeeksAgo = new Date(now.getTime() - 14 * MILLISECONDS_IN_A_DAY);

      let options: Intl.DateTimeFormatOptions;

      // If the date is within the last 2 weeks, include the time
      if (date > twoWeeksAgo) {
        options = {
          month: 'numeric',
          day: 'numeric',
          hour12: true,
          hour: 'numeric',
          minute: 'numeric'
        };
      } else {
        // If the date is more than 2 weeks ago show the year but not the time
        options = {
          dateStyle: 'short'
        };
      }

      return date.toLocaleString(this.i18n.locale.canonicalTag, options).replace(/,/g, '');
    }

    return 'Invalid Date';
  }

  processDiff(deltaA: DeltaStatic, deltaB: DeltaStatic): DeltaStatic {
    // Remove the cid whenever it is found, as this is confusing the diff
    deltaA.forEach(obj => this.removeCid(obj));
    deltaB.forEach(obj => this.removeCid(obj));

    let diff: DeltaStatic = deltaA.diff(deltaB);

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

  private removeCid(obj: any): void {
    if (obj.cid != null) delete obj.cid;
    for (let subObj in obj) {
      if (typeof obj[subObj] === 'object') this.removeCid(obj[subObj]);
    }
  }
}
