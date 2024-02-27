import { Observable } from 'rxjs';

export interface NewTabMenuItem {
  type: string;
  text: string;
  icon?: string;
  disabled?: boolean;
}

export abstract class TabMenuService {
  abstract getMenuItems(tabGroup: string): Observable<NewTabMenuItem[]>;
}
