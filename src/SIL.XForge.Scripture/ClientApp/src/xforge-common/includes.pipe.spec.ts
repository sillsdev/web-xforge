import { TestBed } from '@angular/core/testing';
import { configureTestingModule } from 'xforge-common/test-utils';
import { IncludesPipe } from './includes.pipe';

describe('IncludesPipe', () => {
  let pipe: IncludesPipe;

  configureTestingModule(() => ({
    providers: [IncludesPipe]
  }));

  beforeEach(() => {
    pipe = TestBed.inject(IncludesPipe);
  });

  it('should return true when item is in the array', () => {
    const items: string[] = ['apple', 'banana', 'orange'];
    expect(pipe.transform(items, 'banana')).toBe(true);
  });

  it('should return false when item is not in the array', () => {
    const items: string[] = ['apple', 'banana', 'orange'];
    expect(pipe.transform(items, 'grape')).toBe(false);
  });

  it('should return false when array is empty', () => {
    const items: string[] = [];
    expect(pipe.transform(items, 'apple')).toBe(false);
  });

  it('should return false when array is undefined', () => {
    expect(pipe.transform(undefined, 'apple')).toBe(false);
  });

  it('should work with numeric arrays', () => {
    const items: number[] = [1, 2, 3, 4, 5];
    expect(pipe.transform(items, 3)).toBe(true);
    expect(pipe.transform(items, 6)).toBe(false);
  });

  it('should work with object arrays', () => {
    const obj1 = { id: 1, name: 'Object 1' };
    const obj2 = { id: 2, name: 'Object 2' };
    const obj3 = { id: 3, name: 'Object 3' };
    const items: object[] = [obj1, obj2, obj3];

    expect(pipe.transform(items, obj2)).toBe(true);
    expect(pipe.transform(items, { id: 2, name: 'Object 2' })).toBe(false); // Different reference
  });
});
