export abstract class TabFactoryService<TType, T> {
  abstract createTab(tabType: TType, tabOptions?: Partial<T>): T;
}
