export enum TabEventType {
  Click = 'click',
  Close = 'close',
  Select = 'select'
}

export interface TabEvent {
  index: number;
  type: TabEventType;
}

export interface TabHeaderMouseEvent extends TabEvent {
  mouseEvent: MouseEvent;
}
