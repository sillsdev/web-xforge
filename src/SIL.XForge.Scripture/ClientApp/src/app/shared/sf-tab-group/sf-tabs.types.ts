export interface TabEvent {
  index: number;
}

export interface TabHeaderMouseEvent extends TabEvent {
  mouseEvent: MouseEvent;
}

export interface TabLocation<TGroupId> {
  groupId: TGroupId;
  index: number;
}

export interface TabMoveEvent<TGroupId> {
  from: TabLocation<TGroupId>;
  to: TabLocation<TGroupId>;
}
