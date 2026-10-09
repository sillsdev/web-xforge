import ShareDB from 'sharedb';
import { ObjProxyArg } from 'ts-object-path';
import { OwnedData } from '../models/owned-data';
import { RealtimeServer } from '../realtime-server';
import { obj, ObjPathTemplate } from '../utils/obj-path';
import { DocService } from './doc-service';

/**
 * This is the abstract base class for all doc services that manage JSON0 docs.
 */
export abstract class JsonDocService<T> extends DocService<T> {
  /**
   * The object paths to the properties in the JSON0 doc that clients may change. An op from a client may change only
   * these properties or what is below them, so it may not change any other property, or replace an object that contains
   * one of these properties. Server ops are not limited.
   */
  protected readonly editableProps: ObjPathTemplate[] = [];

  protected pathTemplate<TField>(field?: ObjProxyArg<T, TField>, inherit = true): ObjPathTemplate {
    return obj<T>().pathTemplate(field, inherit);
  }

  /** Whether the ops change only properties that clients may change. */
  protected changesOnlyEditableProps(ops: ShareDB.Op[] | ShareDB.Op): boolean {
    const opList: ShareDB.Op[] = ops instanceof Array ? ops : [ops];
    return opList.every(op => this.getMatchingPathTemplate(this.editableProps, op.p) !== -1);
  }

  protected getMatchingPathTemplate(pathTemplates: ObjPathTemplate[], path: ShareDB.Path, _entity?: OwnedData): number {
    for (let i = 0; i < pathTemplates.length; i++) {
      if (pathTemplates[i].matches(path)) {
        return i;
      }
    }
    return -1;
  }

  init(server: RealtimeServer): void {
    super.init(server);
    // ShareDB accepts any object as a client's op, not only a list of JSON0 components. JSON0 applies anything else as no
    // change, but ShareDB would still commit it, and the update rules would check none of it, so it is denied.
    server.denyUpdate(this.collection, (_docId, _oldDoc, _newDoc, ops) => !isComponentList(ops));
  }
}

/** Whether the op data is a list of JSON0 op components, each with a path. */
function isComponentList(ops: unknown): boolean {
  return Array.isArray(ops) && ops.every(op => op != null && typeof op === 'object' && Array.isArray(op.p));
}
