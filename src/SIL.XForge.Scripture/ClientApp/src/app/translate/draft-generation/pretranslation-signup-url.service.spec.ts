import { TestBed } from '@angular/core/testing';
import { mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { PreTranslationSignupUrlService } from './pretranslation-signup-url.service';

describe('PreTranslationSignupUrlService', () => {
  let service: PreTranslationSignupUrlService;
  const mockActivatedProjectService: ActivatedProjectService = mock(ActivatedProjectService);
  const mockUserService: UserService = mock(UserService);

  configureTestingModule(() => ({
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: UserService, useMock: mockUserService }
    ]
  }));

  beforeEach(() => {
    service = TestBed.inject(PreTranslationSignupUrlService);
  });

  describe('generateSignupUrl', () => {
    it('should generate the signup URL with the correct parameters', async () => {
      const mockUserDoc: UserDoc = { data: { name: 'John', email: 'john@example.com' } } as UserDoc;
      const mockProjectDoc: SFProjectProfileDoc = {
        data: { shortName: 'project', writingSystem: { tag: 'eng' } }
      } as SFProjectProfileDoc;

      when(mockUserService.getCurrentUser()).thenResolve(mockUserDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(mockProjectDoc);

      const url = await service.generateSignupUrl();

      expect(url).toBe(
        'https://app.smartsheet.com/b/form/305798a45a664d8585ac74e72241d8cc?Name=John&Email=john%40example.com&Paratext+Project+Short+Name=project&Project+Language+ISO+Code=eng'
      );
    });

    it('should generate the signup URL without parameters if user or project is undefined', async () => {
      when(mockUserService.getCurrentUser()).thenResolve({ data: undefined } as UserDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn({ data: undefined } as SFProjectProfileDoc);

      const url = await service.generateSignupUrl();

      expect(url).toBe('https://app.smartsheet.com/b/form/305798a45a664d8585ac74e72241d8cc');
    });

    it('should omit language code if it is not a 3-letter code', async () => {
      const mockUserDoc: UserDoc = { data: { name: 'John', email: 'john@example.com' } } as UserDoc;
      const mockProjectDoc: SFProjectProfileDoc = {
        data: { shortName: 'project', writingSystem: { tag: 'en' } }
      } as SFProjectProfileDoc;

      when(mockUserService.getCurrentUser()).thenResolve(mockUserDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(mockProjectDoc);

      const url = await service.generateSignupUrl();

      expect(url).toBe(
        'https://app.smartsheet.com/b/form/305798a45a664d8585ac74e72241d8cc?Name=John&Email=john%40example.com&Paratext+Project+Short+Name=project'
      );
    });

    it('should omit email if it is a transparent authentication noreply email', async () => {
      const mockUserDoc: UserDoc = {
        data: { name: 'John', email: '6ymxqikh3mo5vmmu@users.noreply.scriptureforge.org' }
      } as UserDoc;
      const mockProjectDoc: SFProjectProfileDoc = {
        data: { shortName: 'project', writingSystem: { tag: 'eng' } }
      } as SFProjectProfileDoc;

      when(mockUserService.getCurrentUser()).thenResolve(mockUserDoc);
      when(mockActivatedProjectService.projectDoc).thenReturn(mockProjectDoc);

      const url = await service.generateSignupUrl();
      expect(url).toBe(
        'https://app.smartsheet.com/b/form/305798a45a664d8585ac74e72241d8cc?Name=John&Paratext+Project+Short+Name=project&Project+Language+ISO+Code=eng'
      );
    });
  });
});
