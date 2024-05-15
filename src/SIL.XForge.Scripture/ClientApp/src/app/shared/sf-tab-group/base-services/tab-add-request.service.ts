import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

@Injectable()
export abstract class TabAddRequestService<TType, T> {
  /**
   * Handles a request to add a new tab, including any user prompts for additional info needed to create the tab.
   * @param tabType The type of the new tab.
   * @returns An observable that emits any extra tab info needed to create the tab that will be passed as options
   * to the tab factory. If the observable completes without emitting a value, the tab will not be created.
   */
  abstract handleTabAddRequest(tabType: TType): Observable<Partial<T> | never>;
}

@Injectable()
export class NoopTabAddRequestService<TType, T> extends TabAddRequestService<TType, T> {
  handleTabAddRequest(_: TType): Observable<Partial<T>> {
    return of({});
  }
}
