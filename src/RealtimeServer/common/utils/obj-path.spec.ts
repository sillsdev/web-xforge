import { ANY_INDEX, ANY_KEY, ObjPathTemplate } from './obj-path';

describe('ObjPathTemplate', () => {
  it('supports index wildcard', () => {
    const template = new ObjPathTemplate(['arrayProp', ANY_INDEX, 'prop']);
    expect(template.matches(['arrayProp', 0, 'prop'])).toBe(true);
    expect(template.matches(['arrayProp', 'key', 'prop'])).toBe(false);
  });

  it('supports key wildcard', () => {
    const template = new ObjPathTemplate(['objectProp', ANY_KEY, 'prop']);
    expect(template.matches(['objectProp', 'key', 'prop'])).toBe(true);
  });

  it('inherits when flag set to true', () => {
    const template = new ObjPathTemplate(['objectProp', 'key'], true);
    expect(template.matches(['objectProp'])).toBe(false);
    expect(template.matches(['objectProp', 'key'])).toBe(true);
    expect(template.matches(['objectProp', 'key', 'prop'])).toBe(true);
  });

  it('does not inherit when flag set to false', () => {
    const template = new ObjPathTemplate(['objectProp', 'key'], false);
    expect(template.matches(['objectProp'])).toBe(false);
    expect(template.matches(['objectProp', 'key'])).toBe(true);
    expect(template.matches(['objectProp', 'key', 'prop'])).toBe(false);
  });
});
