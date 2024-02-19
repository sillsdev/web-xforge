import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

export interface NewTabMenuItem {
  type: string;
  text: string;
  icon?: string;
  disabled?: boolean;
}

export abstract class NewTabMenuManager {
  abstract getMenuItems(tabGroup: string): Observable<NewTabMenuItem[]>;
}

/**
 * Default implementation of NewTabMenuManager that returns an empty array of menu items.
 * Prevents 'no providers' error in the case that the new tab menu is not used.
 */
@Injectable({
  providedIn: 'root'
})
export class NewTabMenuManagerService implements NewTabMenuManager {
  constructor() {}

  getMenuItems(): Observable<NewTabMenuItem[]> {
    return of([]);
  }
}
