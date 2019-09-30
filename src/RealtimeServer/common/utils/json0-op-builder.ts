import { getPath, ObjProxyArg } from 'ts-object-path';
import { eq } from './eq';

function getValue<TRoot, T>(object: TRoot, proxy: ObjProxyArg<TRoot, T>, defaultValue?: T | null | undefined) {
  return getPath(proxy).reduce(
    (o, key) => (o != null && o[key] !== undefined ? o[key] : defaultValue),
    object as any
  ) as T;
}

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
    path.push(index);
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
    const list = getValue(this.data, field);
    path.push(list.length);
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
    if (item === undefined) {
      const list = getValue(this.data, field);
      item = list[index];
    }
    path.push(index);
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
    if (oldItem === undefined) {
      const list = getValue(this.data, field);
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
    if (oldValue === undefined) {
      oldValue = getValue(this.data, field);
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
    if (value === undefined) {
      value = getValue(this.data, field);
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
    this.op.push({ p: path, na: n });
    return this;
  }
}
