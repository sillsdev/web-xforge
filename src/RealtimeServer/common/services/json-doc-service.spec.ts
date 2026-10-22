import ShareDB from 'sharedb';
import { ANY_INDEX, ANY_KEY, ObjPathTemplate } from '../utils/obj-path';
import { isComponentList, JsonDocService } from './json-doc-service';

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
    expect(service.changesOnlyEditable({ p: ['answers', '', 'text'], od: 'Old', oi: 'New' })).toBe(false);
    expect(
      service.changesOnlyEditable({ p: ['answers', null, 'text'], od: 'Old', oi: 'New' } as unknown as ShareDB.Op)
    ).toBe(false);
  });

  it('rejects ops when any of them changes a property that is not editable', () => {
    const service = new TestService();
    const allowedOp: ShareDB.Op = { p: ['name'], od: 'Old', oi: 'New' };
    expect(service.changesOnlyEditable([allowedOp, { p: ['answers', 3, 'text'], oi: 'New' }])).toBe(true);
    expect(service.changesOnlyEditable([allowedOp, { p: [], od: {}, oi: {} }])).toBe(false);
  });
});

describe('isComponentList', () => {
  it('recognizes components by a path and an instruction in each', () => {
    expect(isComponentList([{ p: ['name'], oi: 'New' }])).toBe(true);
    expect(
      isComponentList([
        { p: [], na: 1 },
        { p: ['answers', 0], ld: {} }
      ])
    ).toBe(true);
    // An op that changes nothing is still a list of components
    expect(isComponentList([])).toBe(true);
  });

  it('does not recognize op data that is not a list', () => {
    // A rich-text delta
    expect(isComponentList({ ops: [{ insert: 'New' }] })).toBe(false);
    // A single component, rather than a list of them
    expect(isComponentList({ p: ['name'], oi: 'New' })).toBe(false);
  });

  it('does not recognize a component with no path or no instruction', () => {
    expect(isComponentList([{ oi: 'New' }])).toBe(false);
    expect(isComponentList([{ p: ['name'] }])).toBe(false);
    // `p` should be an array.
    expect(isComponentList([{ p: 'name', oi: 'New' }])).toBe(false);
    // Not a component at all, so there is no path to read from it
    expect(isComponentList([null])).toBe(false);
  });

  it('recognizes a component that names a subtype, whether or not it carries the subtype op', () => {
    expect(isComponentList([{ p: ['text'], t: 'text0', o: [{ insert: 'New' }] }])).toBe(true);
    // JSON0 needs both "t" and "o", and refuses a component with only "t" when it applies the op
    expect(isComponentList([{ p: ['text'], t: 'text0' }])).toBe(true);
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
