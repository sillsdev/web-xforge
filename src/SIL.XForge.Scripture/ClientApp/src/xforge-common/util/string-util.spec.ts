import { areStringArraysEqual, stripHtml } from './string-util';

describe('areStringArraysEqual', () => {
  it('should return true if two empty arrays are compared', () => {
    expect(areStringArraysEqual([], [])).toBe(true);
  });

  it('should return true if two identical arrays are compared', () => {
    expect(areStringArraysEqual(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true);
  });

  it('should return false if two arrays with different lengths are compared', () => {
    expect(areStringArraysEqual(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
  });

  it('should return false if two arrays with different elements are compared', () => {
    expect(areStringArraysEqual(['a', 'b', 'c'], ['x', 'y', 'z'])).toBe(false);
  });
});

describe('stripHtml', () => {
  it('returns empty string for null/undefined input', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml(null as any)).toBe('');
    expect(stripHtml(undefined as any)).toBe('');
  });

  it('returns original string when no tags present', () => {
    expect(stripHtml('Hello World')).toBe('Hello World');
    expect(stripHtml('123')).toBe('123');
  });

  it('removes HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
    expect(stripHtml('<div><span>Text</span></div>')).toBe('Text');
  });

  it('removes stray angle brackets', () => {
    expect(stripHtml('a < b > c')).toBe('a  b  c');
    expect(stripHtml('< text >')).toBe(' text ');
    expect(stripHtml('<div>hi></div>')).toBe('hi');
  });

  it('handles complex HTML with attributes', () => {
    expect(stripHtml('<div class="test" id="123">Content</div>')).toBe('Content');
    expect(stripHtml('<a href="http://test.com">Link</a>')).toBe('Link');
  });

  it('handles nested tags and preserves whitespace', () => {
    expect(stripHtml('<div>Outer <span>Inner</span> Text</div>')).toBe('Outer Inner Text');
    expect(stripHtml('<p>Line 1</p>\n<p>Line 2</p>')).toBe('Line 1\nLine 2');
  });

  it('handles malformed HTML', () => {
    expect(stripHtml('<div>Unclosed')).toBe('Unclosed');
    expect(stripHtml('Unopened</div>')).toBe('Unopened');
    expect(stripHtml('<div>Mismatched</span>')).toBe('Mismatched');
  });

  it('handles special characters', () => {
    expect(stripHtml('&lt;div&gt;')).toBe('&lt;div&gt;');
    expect(stripHtml('<div>&copy; 2024</div>')).toBe('© 2024');
  });
});
