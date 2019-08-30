import ShareDB = require('sharedb');

export const ANY_KEY = '*';
export const ANY_INDEX = -1;

/**
 * This class represents the generic template for a path to a property in an object.
 */
export class PathTemplate {
  constructor(public readonly template: ShareDB.Path = [], public readonly inherit: boolean = true) {}

  matches(path: ShareDB.Path): boolean {
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
