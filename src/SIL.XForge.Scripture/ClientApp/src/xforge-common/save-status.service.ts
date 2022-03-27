import { Injectable } from '@angular/core';
import { isEmpty, isEqual } from 'lodash-es';
import { BehaviorSubject, merge, timer } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, map, pairwise, switchMap, throttleTime } from 'rxjs/operators';
import { PwaService } from 'xforge-common/pwa.service';

const UI_DISPLAY_TIME = 3000;

@Injectable({
  providedIn: 'root'
})
export class SaveStatusService {
  private readonly savingOfflineSubject = new BehaviorSubject<boolean>(false);
  private readonly savingOnlineSubject = new BehaviorSubject<boolean>(false);

  private readonly docsSavingOffline = new Set();
  private readonly docsSavingOnline = new Set();

  private readonly savingOffline$ = this.savingOfflineSubject.asObservable();
  //.pipe(tap(off => console.log('s offline', off)));
  private readonly savingOnline$ = this.savingOnlineSubject.asObservable();
  //.pipe(tap(off => console.log('s online', off)));

  readonly saving$ = this.pwaService.onlineStatus.pipe(
    //tap(online => console.log('online', online)),
    switchMap(online => {
      const saving$ = online ? this.savingOnline$ : this.savingOffline$;
      return saving$.pipe(map(saving => ({ saving, online })));
    }),
    distinctUntilChanged(isEqual)
  );

  private readonly uiShowSaving$ = this.saving$.pipe(
    //tap(s => console.log('saving', s)),
    pairwise(),
    filter(([was, is]) => !was.saving && is.saving),
    map(([_, is]) => is),
    throttleTime(UI_DISPLAY_TIME, undefined, { leading: true, trailing: false })
  );

  private readonly uiHideSaving$ = this.uiShowSaving$.pipe(
    //tap(() => console.log('s')),
    switchMap(() => timer(UI_DISPLAY_TIME).pipe(switchMap(() => this.saving$))),
    //switchMap(() => saving$), // do we get the last value?
    //tap(saving => console.log('_', saving)),
    filter(status => !status.saving)
    //tap(saving => console.log('e', saving))
  );

  readonly uiSaving$ = merge(this.uiShowSaving$, this.uiHideSaving$);

  private readonly uiShowFinishedSaving$ = this.uiSaving$.pipe(
    pairwise(),
    filter(([was, is]) => was.saving && !is.saving),
    map(([_, is]) => ({ finishedSaving: true, online: is.online }))
  );

  private readonly uiHideFinishedSaving$ = this.uiShowFinishedSaving$.pipe(
    debounceTime(UI_DISPLAY_TIME),
    map(({ online }) => ({ finishedSaving: false, online }))
  );

  readonly uiJustFinishedSaving$ = merge(this.uiShowFinishedSaving$, this.uiHideFinishedSaving$);

  constructor(private readonly pwaService: PwaService) {}

  startedSavingDocOffline(docId: String): void {
    this.docsSavingOffline.add(docId);
    this.savingOfflineSubject.next(!isEmpty(this.docsSavingOffline));
  }

  finishedSavingDocOffline(docId: String): void {
    this.docsSavingOffline.delete(docId);
    this.savingOfflineSubject.next(!isEmpty(this.docsSavingOffline));
  }

  startedSavingDocOnline(docId: String): void {
    this.docsSavingOnline.add(docId);
    this.savingOnlineSubject.next(!isEmpty(this.docsSavingOnline));
  }

  finishedSavingDocOnline(docId: String): void {
    this.docsSavingOnline.delete(docId);
    this.savingOnlineSubject.next(!isEmpty(this.docsSavingOnline));
  }
}
