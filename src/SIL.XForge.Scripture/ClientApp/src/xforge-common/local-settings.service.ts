import { Injectable } from '@angular/core';
import { fromEvent, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

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
        oldValue: evt.oldValue != null ? JSON.parse(evt.oldValue) : undefined,
        newValue: evt.newValue != null ? JSON.parse(evt.newValue) : undefined
      }))
    );
  }

  get<T>(key: string): T | undefined {
    const value = localStorage.getItem(key);
    return value != null ? JSON.parse(value) : undefined;
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
