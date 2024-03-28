export interface TabEvent {
  index: number;
}

export interface TabHeaderPointerEvent extends TabEvent {
  pointerEvent: MouseEvent | TouchEvent;
}

export interface TabLocation<TGroupId> {
  groupId: TGroupId;
  index: number;
}

export interface TabMoveEvent<TGroupId> {
  from: TabLocation<TGroupId>;
  to: TabLocation<TGroupId>;
}
