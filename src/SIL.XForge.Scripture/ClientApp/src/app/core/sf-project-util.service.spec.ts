import { SFProjectUtilService } from './sf-project-util.service';

describe('SFProjectUtilService', () => {
  let service: SFProjectUtilService;

  beforeEach(() => {
    service = new SFProjectUtilService();
  });

  describe('isResource', () => {
    it('should return true for a resource id', () => {
      const id = '1234567890abcdef';
      expect(service.isResource(id)).toBe(true);
    });

    it('should return false for a project id', () => {
      const id = '123456781234567890abcdef1234567890abcdef1234567890abcdef';
      expect(service.isResource(id)).toBe(false);
    });
  });
});
