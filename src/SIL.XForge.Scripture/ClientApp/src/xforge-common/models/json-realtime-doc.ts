import { eq } from '@orbit/utils';
import { OtJson0Op } from 'ot-json0';
import { get, getPath, ObjProxyArg } from 'ts-object-path';
import { RealtimeDoc } from './realtime-doc';

/** See https://github.com/ottypes/json0 */
export abstract class JsonRealtimeDoc<T = any> extends RealtimeDoc<T, OtJson0Op[]> {
  async submitJson0Op(build: (op: Json0OpBuilder<T>) => void, source?: any): Promise<void> {
    const builder = new Json0OpBuilder(this.data);
    build(builder);
    if (builder.op.length > 0) {
      await this.submit(builder.op, source);
    }
  }
}

export class Json0OpBuilder<T> {
  readonly op: OtJson0Op[] = [];

  constructor(private readonly data: Readonly<T>) {}

  insert<TItem>(field: ObjProxyArg<T, TItem[]>, index: number, item: TItem): Json0OpBuilder<T> {
    const path = getPath(field) as (string | number)[];
    path.push(index);
    this.op.push({ p: path, li: item });
    return this;
  }

  add<TItem>(field: ObjProxyArg<T, TItem[]>, item: TItem): Json0OpBuilder<T> {
    const path = getPath(field) as (string | number)[];
    const list = get(this.data, field);
    path.push(list.length);
    this.op.push({ p: path, li: item });
    return this;
  }

  remove<TItem>(field: ObjProxyArg<T, TItem[]>, index: number, item?: TItem): Json0OpBuilder<T> {
    const path = getPath(field) as (string | number)[];
    if (item === undefined) {
      const list = get(this.data, field);
      item = list[index];
    }
    path.push(index);
    this.op.push({ p: path, ld: item });
    return this;
  }

  replace<TItem>(field: ObjProxyArg<T, TItem[]>, index: number, newItem: TItem, oldItem?: TItem): Json0OpBuilder<T> {
    const path = getPath(field) as (string | number)[];
    if (oldItem === undefined) {
      const list = get(this.data, field);
      oldItem = list[index];
    }
    if (!eq(oldItem, newItem)) {
      path.push(index);
      this.op.push({ p: path, li: newItem, ld: oldItem });
    }
    return this;
  }

  set<TField>(field: ObjProxyArg<T, TField>, newValue: TField, oldValue?: TField): Json0OpBuilder<T> {
    const path = getPath(field) as (string | number)[];
    if (oldValue === undefined) {
      oldValue = get(this.data, field);
    }
    if (!eq(newValue, oldValue)) {
      this.op.push({ p: path, oi: newValue, od: oldValue });
    }
    return this;
  }

  unset<TField>(field: ObjProxyArg<T, TField>, value?: TField): Json0OpBuilder<T> {
    const path = getPath(field) as (string | number)[];
    if (value === undefined) {
      value = get(this.data, field);
    }
    this.op.push({ p: path, od: value });
    return this;
  }

  inc(field: ObjProxyArg<T, number>, n: number = 1): Json0OpBuilder<T> {
    const path = getPath(field) as (string | number)[];
    this.op.push({ p: path, na: n });
    return this;
  }
}
