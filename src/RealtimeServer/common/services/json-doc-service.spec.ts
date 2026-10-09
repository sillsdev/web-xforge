import ShareDB from 'sharedb';
import { ANY_INDEX, ANY_KEY, ObjPathTemplate } from '../utils/obj-path';
import { JsonDocService } from './json-doc-service';

describe('JsonDocService', () => {
  it('allows ops on editable properties', () => {
    const service = new TestService();
    expect(service.changesOnlyEditable({ p: ['name'], od: 'Old', oi: 'New' })).toBe(true);
    expect(service.changesOnlyEditable({ p: ['answers', 3, 'text'], od: 'Old', oi: 'New' })).toBe(true);
    expect(service.changesOnlyEditable({ p: ['sites', 'sf', 'currentProjectId'], oi: 'project01' })).toBe(true);
  });

  it('allows ops below an editable property', () => {
    const service = new TestService();
    expect(service.changesOnlyEditable({ p: ['tags', 0], li: 'tag' })).toBe(true);
  });

  it('rejects ops on properties that are not editable', () => {
    const service = new TestService();
    expect(service.changesOnlyEditable({ p: ['roles'], oi: ['system_admin'] })).toBe(false);
    expect(service.changesOnlyEditable({ p: ['answers', 3, 'ownerRef'], od: 'user01', oi: 'user02' })).toBe(false);
  });

  it('rejects ops on an object that contains an editable property', () => {
    const service = new TestService();
    expect(service.changesOnlyEditable({ p: [], od: {}, oi: {} })).toBe(false);
    expect(service.changesOnlyEditable({ p: ['answers'], od: [], oi: [] })).toBe(false);
    expect(service.changesOnlyEditable({ p: ['answers', 3], ld: {}, li: {} })).toBe(false);
    expect(service.changesOnlyEditable({ p: ['sites', 'sf'], od: {}, oi: {} })).toBe(false);
  });

  it('rejects ops that index an array with something other than a number', () => {
    const service = new TestService();
    // JSON0 converts these to indexes into the array
    expect(service.changesOnlyEditable({ p: ['answers', '3', 'text'], od: 'Old', oi: 'New' })).toBe(false);
    expect(service.changesOnlyEditable({ p: ['answers', 'abc', 'text'], od: 'Old', oi: 'New' })).toBe(false);
  });

  it('rejects ops when any of them changes a property that is not editable', () => {
    const service = new TestService();
    const allowedOp: ShareDB.Op = { p: ['name'], od: 'Old', oi: 'New' };
    expect(service.changesOnlyEditable([allowedOp, { p: ['answers', 3, 'text'], oi: 'New' }])).toBe(true);
    expect(service.changesOnlyEditable([allowedOp, { p: [], od: {}, oi: {} }])).toBe(false);
  });
});

class TestService extends JsonDocService<unknown> {
  readonly collection = 'test';
  protected readonly indexPaths = [];
  protected readonly editableProps = [
    new ObjPathTemplate(['name']),
    new ObjPathTemplate(['tags']),
    new ObjPathTemplate(['sites', ANY_KEY, 'currentProjectId']),
    new ObjPathTemplate(['answers', ANY_INDEX, 'text'])
  ];

  constructor() {
    super([]);
  }

  changesOnlyEditable(ops: ShareDB.Op[] | ShareDB.Op): boolean {
    return this.changesOnlyEditableProps(ops);
  }
}
