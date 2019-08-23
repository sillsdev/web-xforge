import ShareDB = require('sharedb');
import { getPath, ObjProxyArg } from 'ts-object-path';
import { PathTemplate } from '../path-template';
import { DocService } from './doc-service';

/**
 * This is the abstract base class for all doc services that manage JSON0 docs.
 */
export abstract class JsonDocService<T> extends DocService<T> {
  /**
   * The object paths to the immutable properties in the JSON0 doc.
   */
  protected readonly immutableProps: PathTemplate[] = [];

  protected createPathTemplate<TField>(template: ObjProxyArg<T, TField>, inherit: boolean = true): PathTemplate {
    return new PathTemplate(getPath(template), inherit);
  }

  protected checkImmutableProps(ops: ShareDB.Op[]): boolean {
    for (const op of ops) {
      if (this.getMatchingPathTemplate(this.immutableProps, op.p) !== -1) {
        return false;
      }
    }
    return true;
  }

  protected getMatchingPathTemplate(pathTemplates: PathTemplate[], path: ShareDB.Path): number {
    for (let i = 0; i < pathTemplates.length; i++) {
      if (pathTemplates[i].matches(path)) {
        return i;
      }
    }
    return -1;
  }
}
