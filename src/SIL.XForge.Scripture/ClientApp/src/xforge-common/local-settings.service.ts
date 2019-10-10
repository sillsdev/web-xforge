import { Injectable } from '@angular/core';
import { fromEvent, Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { parseJSON } from './utils';

export interface LocalSettingChangeEvent {
  key: string | null;
  oldValue?: any;
  newValue?: any;
}

@Injectable({
  providedIn: 'root'
})
export class LocalSettingsService {
  readonly remoteChanges$: Observable<LocalSettingChangeEvent>;

  constructor() {
    this.remoteChanges$ = fromEvent<StorageEvent>(window, 'storage').pipe(
      map(evt => ({
        key: evt.key,
        oldValue: evt.oldValue != null ? parseJSON(evt.oldValue) : undefined,
        newValue: evt.newValue != null ? parseJSON(evt.newValue) : undefined
      }))
    );
  }

  get<T>(key: string): T | undefined {
    const value = localStorage.getItem(key);
    return value != null ? parseJSON(value) : undefined;
  }

  set<T>(key: string, value?: T): void {
    if (value == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  remove(key: string): void {
    localStorage.removeItem(key);
  }

  has(key: string): boolean {
    return localStorage.getItem(key) != null;
  }

  clear(): void {
    localStorage.clear();
  }
}
