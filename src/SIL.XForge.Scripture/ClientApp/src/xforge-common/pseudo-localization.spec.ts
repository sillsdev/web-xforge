import { PseudoLocalization } from './pseudo-localization';

describe('pseudo-localization', () => {
  it('should not localize variables', () => {
    expect(PseudoLocalization.localize({ key: 'ABC {{ var }} xyz' })).toEqual({ key: 'BCD {{ var }} yza' });
  });

  it('should add spaces to single words', () => {
    expect(
      PseudoLocalization.localize({
        a: { x: 'abcd' },
        b: { y: 'bcde' }
      })
    ).toEqual({
      a: { x: 'bc de' },
      b: { y: 'cd ef' }
    });
  });
});
