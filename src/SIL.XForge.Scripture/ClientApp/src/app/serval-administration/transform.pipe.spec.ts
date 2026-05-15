import { TransformWithPipe } from './transform.pipe';

describe('TransformWithPipe', () => {
  let pipe: TransformWithPipe;

  beforeEach(() => {
    pipe = new TransformWithPipe();
  });

  it('applies fn to a defined input', () => {
    const result = pipe.transform(4, value => (value ?? 0) * 3);

    expect(result).toBe(12);
  });

  it('passes undefined input through to fn', () => {
    const result = pipe.transform(undefined, value => (value == null ? 'nullish' : 'non-nullish'));

    expect(result).toBe('nullish');
  });

  it('passes null input through to fn', () => {
    const result = pipe.transform<number, string>(null, value => (value == null ? 'nullish' : 'non-nullish'));

    expect(result).toBe('nullish');
  });
});
