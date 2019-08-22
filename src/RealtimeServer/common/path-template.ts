import ShareDB = require('sharedb');

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
      if (this.template[j] === -1) {
        if (typeof path[j] !== 'number') {
          return false;
        }
      } else if (this.template[j] !== '*' && this.template[j] !== path[j]) {
        return false;
      }
    }
    return true;
  }
}
