import { getPath, ObjProxyArg } from 'ts-object-path';
import { eq } from './eq';
import { getValue, PathItem } from './obj-path';

export class Json0OpBuilder<T> {
  readonly op: any[] = [];

  constructor(private readonly data: Readonly<T>) {}

  /**
   * Inserts an item into the specified array at the specified index.
   *
   * @param {ObjProxyArg<T, TItem[]>} field The path to the array.
   * @param {number} index The index.
   * @param {TItem} item The item to insert.
   */
  insert<TItem>(field: ObjProxyArg<T, TItem[]>, index: number, item: TItem): Json0OpBuilder<T> {
    const path = getPath(field);
    return this.pathInsert(path, index, item);
  }

  /**
   * Inserts an item into the specified array at the specified index.
   *
   * @param {PathItem[]} path The path to the array.
   * @param {number} index The index.
   * @param {any} item The item to insert.
   */
  pathInsert(path: PathItem[], index: number, item: any): Json0OpBuilder<T> {
    path = path.concat([index]);
    this.op.push({ p: path, li: item });
    return this;
  }

  /**
   * Adds an item to the end of the specified array.
   *
   * @param {ObjProxyArg<T, TItem[]>} field The path to the array.
   * @param {TItem} item The item to add.
   */
  add<TItem>(field: ObjProxyArg<T, TItem[]>, item: TItem): Json0OpBuilder<T> {
    const path = getPath(field);
    return this.pathAdd(path, item);
  }

  /**
   * Adds an item to the end of the specified array.
   *
   * @param {PathItem[]} path The path to the array.
   * @param {any} item The item to add.
   */
  pathAdd(path: PathItem[], item: any): Json0OpBuilder<T> {
    const list = getValue<any[]>(this.data, path)!;
    path = path.concat([list.length]);
    this.op.push({ p: path, li: item });
    return this;
  }

  /**
   * Removes an item from the specified array at the specified index.
   *
   * @param {ObjProxyArg<T, TItem[]>} field The path to the array.
   * @param {number} index The index.
   * @param {TItem} [item] The item to remove. It is usually not necessary to provide this unless a previous operation
   * in the builder has altered the item in some way.
   */
  remove<TItem>(field: ObjProxyArg<T, TItem[]>, index: number, item?: TItem): Json0OpBuilder<T> {
    const path = getPath(field);
    return this.pathRemove(path, index, item);
  }

  /**
   * Removes an item from the specified array at the specified index.
   *
   * @param {PathItem[]} path The path to the array.
   * @param {number} index The index.
   * @param {any} [item] The item to remove. It is usually not necessary to provide this unless a previous operation
   * in the builder has altered the item in some way.
   */
  pathRemove(path: PathItem[], index: number, item?: any): Json0OpBuilder<T> {
    if (item === undefined) {
      const list = getValue<any[]>(this.data, path)!;
      item = list[index];
    }
    path = path.concat([index]);
    this.op.push({ p: path, ld: item });
    return this;
  }

  /**
   * Replaces an item in the specified array at the specified index.
   *
   * @param {ObjProxyArg<T, TItem[]>} field The path to the array.
   * @param {number} index The index.
   * @param {TItem} newItem The new item.
   * @param {TItem} [oldItem] The item to replace. It is usually not necessary to provide this unless a previous
   * operation in the builder has altered the item in some way.
   */
  replace<TItem>(field: ObjProxyArg<T, TItem[]>, index: number, newItem: TItem, oldItem?: TItem): Json0OpBuilder<T> {
    const path = getPath(field);
    return this.pathReplace(path, index, newItem, oldItem);
  }

  /**
   * Replaces an item in the specified array at the specified index.
   *
   * @param {PathItem[]} path The path to the array.
   * @param {number} index The index.
   * @param {any} newItem The new item.
   * @param {any} [oldItem] The item to replace. It is usually not necessary to provide this unless a previous
   * operation in the builder has altered the item in some way.
   */
  pathReplace(path: PathItem[], index: number, newItem: any, oldItem?: any): Json0OpBuilder<T> {
    if (oldItem === undefined) {
      const list = getValue<any[]>(this.data, path)!;
      oldItem = list[index];
    }
    if (!eq(oldItem, newItem)) {
      path.push(index);
      this.op.push({ p: path, li: newItem, ld: oldItem });
    }
    return this;
  }

  /**
   * Sets the specified field to the specified value.
   *
   * @param {ObjProxyArg<T, TField>} field The path to the field.
   * @param {TField} newValue The new value.
   * @param {TField} [oldValue] The current value. It is usually not necessary to provide this unless a previous
   * operation in the builder has altered the field in some way.
   */
  set<TField>(field: ObjProxyArg<T, TField>, newValue: TField, oldValue?: TField): Json0OpBuilder<T> {
    const path = getPath(field);
    return this.pathSet(path, newValue, oldValue);
  }

  /**
   * Sets the specified field to the specified value.
   *
   * @param {PathItem[]} path The path to the field.
   * @param {any} newValue The new value.
   * @param {any} [oldValue] The current value. It is usually not necessary to provide this unless a previous
   * operation in the builder has altered the field in some way.
   */
  pathSet(path: PathItem[], newValue: any, oldValue?: any): Json0OpBuilder<T> {
    if (oldValue === undefined) {
      oldValue = getValue(this.data, path);
    }
    if (!eq(newValue, oldValue)) {
      this.op.push({ p: path, oi: newValue, od: oldValue });
    }
    return this;
  }

  /**
   * Unsets the specified field.
   *
   * @param {ObjProxyArg<T, TField>} field The path to the field.
   * @param {TField} [value] The current value. It is usually not necessary to provide this unless a previous operation
   * in the builder has altered the field in some way.
   */
  unset<TField>(field: ObjProxyArg<T, TField>, value?: TField): Json0OpBuilder<T> {
    const path = getPath(field);
    return this.pathUnset(path, value);
  }

  /**
   * Unsets the specified field.
   *
   * @param {PathItem[]} path The path to the field.
   * @param {any} [value] The current value. It is usually not necessary to provide this unless a previous operation
   * in the builder has altered the field in some way.
   */
  pathUnset(path: PathItem[], value?: any): Json0OpBuilder<T> {
    if (value === undefined) {
      value = getValue(this.data, path);
    }
    if (value !== undefined) {
      this.op.push({ p: path, od: value });
    }
    return this;
  }

  /**
   * Increments/decrements the specified field by the specified amount.
   *
   * @param {ObjProxyArg<T, number>} field The path to the field.
   * @param {number} [n=1] The amount to increment/decrement the field. Use negative values to decrement.
   */
  inc(field: ObjProxyArg<T, number>, n: number = 1): Json0OpBuilder<T> {
    const path = getPath(field);
    return this.pathInc(path, n);
  }

  /**
   * Increments/decrements the specified field by the specified amount.
   *
   * @param {PathItem[]} path The path to the field.
   * @param {number} [n=1] The amount to increment/decrement the field. Use negative values to decrement.
   */
  pathInc(path: PathItem[], n: number = 1): Json0OpBuilder<T> {
    this.op.push({ p: path, na: n });
    return this;
  }
}
