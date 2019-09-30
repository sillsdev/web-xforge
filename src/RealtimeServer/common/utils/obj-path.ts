import { getPath, ObjProxyArg } from 'ts-object-path';

export const ANY_KEY = '*';
export const ANY_INDEX = -1;

export function obj<T>(): ObjPathBuilder<T> {
  return new ObjPathBuilder<T>();
}

export class ObjPathBuilder<T> {
  path<TField>(field?: ObjProxyArg<T, TField>): Array<string | number | symbol> {
    if (field == null) {
      return [];
    }
    return getPath(field);
  }

  pathStr<TField>(field?: ObjProxyArg<T, TField>): string {
    if (field == null) {
      return '';
    }
    return getPath(field).join('.');
  }

  pathTemplate<TField>(field?: ObjProxyArg<T, TField>, inherit: boolean = true): ObjPathTemplate {
    if (field == null) {
      return new ObjPathTemplate();
    }
    return new ObjPathTemplate(getPath(field), inherit);
  }
}

/**
 * This class represents the generic template for a path to a property in an object.
 */
export class ObjPathTemplate {
  constructor(
    public readonly template: Array<string | number | symbol> = [],
    public readonly inherit: boolean = true
  ) {}

  matches(path: Readonly<Array<string | number | symbol>>): boolean {
    if (
      (this.inherit && path.length < this.template.length) ||
      (!this.inherit && path.length !== this.template.length)
    ) {
      return false;
    }

    for (let j = 0; j < this.template.length; j++) {
      if (this.template[j] === ANY_INDEX) {
        if (typeof path[j] !== 'number') {
          return false;
        }
      } else if (this.template[j] !== ANY_KEY && this.template[j] !== path[j]) {
        return false;
      }
    }
    return true;
  }
}
