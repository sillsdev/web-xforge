import { Observable } from 'rxjs';

export interface TabMenuItem {
  type: string;
  text: string;
  icon?: string;
  svgIcon?: string;
  disabled?: boolean;
}

export abstract class TabMenuService<TGroupId extends string> {
  abstract getMenuItems(groupId?: TGroupId): Observable<TabMenuItem[]>;
}
