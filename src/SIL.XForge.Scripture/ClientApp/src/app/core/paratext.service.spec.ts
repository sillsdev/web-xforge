import { ParatextService } from './paratext.service';

describe('ParatextService', () => {
  describe('isResource', () => {
    it('should return true for a resource id', () => {
      const id = '1234567890abcdef';
      expect(ParatextService.isResource(id)).toBe(true);
    });

    it('should return false for a project id', () => {
      const id = '123456781234567890abcdef1234567890abcdef1234567890abcdef';
      expect(ParatextService.isResource(id)).toBe(false);
    });
  });
});
