import { Injectable } from '@angular/core';

export interface SignalRMessageCount {
  hub: string;
  event: string;
  count: number;
}

/**
 * Counts the SignalR messages received by the browser, for display in the developer diagnostics overlay.
 */
@Injectable({
  providedIn: 'root'
})
export class SignalRDiagnosticsService {
  private readonly counts = new Map<string, SignalRMessageCount>();

  get messageCounts(): SignalRMessageCount[] {
    return Array.from(this.counts.values());
  }

  get totalMessageCount(): number {
    let total: number = 0;
    for (const messageCount of this.counts.values()) total += messageCount.count;
    return total;
  }

  recordMessage(hub: string, event: string): void {
    const key: string = `${hub} ${event}`;
    const messageCount: SignalRMessageCount | undefined = this.counts.get(key);
    if (messageCount == null) {
      this.counts.set(key, { hub: hub, event: event, count: 1 });
    } else {
      messageCount.count++;
    }
  }
}
