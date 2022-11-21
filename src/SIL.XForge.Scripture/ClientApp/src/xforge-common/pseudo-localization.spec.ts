import { PseudoLocalization } from './pseudo-localization';

describe('pseudo-localization', () => {
  it('should localize', () => {
    expect(PseudoLocalization.localize({ key: 'ABC {{ var }} xyz' })).toEqual({ key: 'BCD {{ var }} yza' });
    expect(PseudoLocalization.localize({ a: { x: 'a' }, b: { y: 'b' } })).toEqual({ a: { x: 'b' }, b: { y: 'c' } });
  });
});
