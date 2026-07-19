import { Injectable } from '@angular/core';

/**
 * This class helps monitor the lifecyle of realtime documents and detect situations where documents are rapidly
 * destroyed and then recreated.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeDocLifecycleMonitorService {
  monitoringEnabled: boolean = false;

  setMonitoringEnabled(enabled: boolean): void {
    this.monitoringEnabled = enabled;
  }

  createdTimestamps: {
    [id: string]: {
      timestamp: number;
      creatorName: string;
    }[];
  } = {};

  destroyedTimestamps: {
    [id: string]: number[];
  } = {};

  docCreated(id: string, creatorName: string): void {
    if (this.monitoringEnabled) {
      this.createdTimestamps[id] ??= [];
      this.createdTimestamps[id].push({ timestamp: Date.now(), creatorName });
    }
  }

  docDestroyed(id: string): void {
    if (this.monitoringEnabled) {
      this.destroyedTimestamps[id] ??= [];
      this.destroyedTimestamps[id].push(Date.now());
    }
  }

  /**
   * Finds instances where a document is destroyed and then recreated within a short time period.
   * @param timeThreshold The maximum time in milliseconds between destruction and recreation to consider it thrashing.
   * @param times The minimum number of times the document must be recreated within the time threshold to be considered
   * thrashing (the recreates do not all have to occur within the time threshold, but each recreate must be within the
   * threshold of the previous destroy to be counted).
   * @return An object where the keys are document IDs and the values are arrays of the time differences between
   * destruction and recreation.
   */
  getThrashingDocuments(
    timeThreshold: number,
    times: number
  ): {
    [id: string]: {
      creatorName: string;
      recreateDuration: number;
    }[];
  } {
    const thrashingDocs: { [id: string]: { creatorName: string; recreateDuration: number }[] } = {};
    for (const id of Object.keys(this.createdTimestamps)) {
      const recreates = this.getDocumentRecreates(id);
      const recreateTimes: { creatorName: string; recreateDuration: number }[] = [];
      for (const recreate of recreates) {
        const recreateDuration = recreate.created - recreate.destroyed;
        if (recreateDuration <= timeThreshold) {
          recreateTimes.push({ creatorName: recreate.creatorName, recreateDuration });
        }
      }
      if (recreateTimes.length >= times) {
        thrashingDocs[id] = recreateTimes;
      }
    }
    return thrashingDocs;
  }

  getAllDocumentRecreates(): { [id: string]: { created: number; destroyed: number; creatorName: string }[] } {
    const recreates: { [id: string]: { created: number; destroyed: number; creatorName: string }[] } = {};
    for (const id of Object.keys(this.createdTimestamps)) {
      recreates[id] = this.getDocumentRecreates(id);
    }
    return recreates;
  }

  getDocumentRecreates(id: string): { destroyed: number; created: number; creatorName: string }[] {
    const created = this.createdTimestamps[id] ?? [];
    const destroyed = this.destroyedTimestamps[id] ?? [];
    const recreates: { created: number; destroyed: number; creatorName: string }[] = [];
    for (let i = 0; i < created.length; i++) {
      const createdTime = created[i].timestamp;
      // Since monitoring is not always enabled, the timestamp for the prior destruction may not be at the same index
      // or exist at all
      const destroyedTime = destroyed.filter(timestamp => timestamp <= createdTime).pop();
      if (destroyedTime != null) {
        recreates.push({ created: createdTime, destroyed: destroyedTime, creatorName: created[i].creatorName });
      }
    }
    return recreates;
  }
}
