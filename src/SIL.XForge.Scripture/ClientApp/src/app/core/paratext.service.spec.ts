import { HttpClient } from '@angular/common/http';
import { mock } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { ParatextService } from './paratext.service';

describe('ParatextService', () => {
  const mockHttpClient = mock(HttpClient);
  const mockAuthService = mock(AuthService);

  configureTestingModule(() => ({
    providers: [
      { provide: HttpClient, useMock: mockHttpClient },
      { provide: AuthService, useMock: mockAuthService }
    ]
  }));

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
