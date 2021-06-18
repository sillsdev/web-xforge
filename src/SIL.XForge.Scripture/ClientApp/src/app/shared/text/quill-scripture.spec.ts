import Quill from 'quill';

describe('quill-scripture', () => {
  it('constructs segments properly', () => {
    const segmentElement = Quill.import('blots/segment').create('s1_1');
    expect(segmentElement.getAttribute('data-style-description')).toBe('s1 - Heading - Section Level 1');
  });
});
