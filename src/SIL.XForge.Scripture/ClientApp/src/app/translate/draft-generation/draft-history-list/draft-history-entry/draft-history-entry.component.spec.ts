import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { createTestUserProfile } from 'realtime-server/lib/esm/common/models/user-test-data';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { anything, mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { BuildDto } from '../../../../machine-api/build-dto';
import { BuildStates } from '../../../../machine-api/build-states';
import { DraftHistoryEntryComponent } from './draft-history-entry.component';

const mockedI18nService = mock(I18nService);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);

describe('DraftHistoryEntryComponent', () => {
  let component: DraftHistoryEntryComponent;
  let fixture: ComponentFixture<DraftHistoryEntryComponent>;

  configureTestingModule(() => ({
    imports: [TestTranslocoModule],
    providers: [
      { provide: I18nService, useMock: mockedI18nService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(DraftHistoryEntryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('forceDetailsOpen should set detailsOpen', () => {
    expect(component.detailsOpen).toBe(false);
    component.forceDetailsOpen = true;
    expect(component.detailsOpen).toBe(true);
    expect(component.forceDetailsOpen).toBe(true);
    component.forceDetailsOpen = false;
    expect(component.detailsOpen).toBe(true);
    expect(component.forceDetailsOpen).toBe(false);
  });

  it('headerClicked should toggle detailsOpen', () => {
    expect(component.detailsOpen).toBe(false);
    component.headerClicked();
    expect(component.detailsOpen).toBe(true);
    component.headerClicked();
    expect(component.detailsOpen).toBe(false);
  });

  describe('entry', () => {
    it('should handle undefined values', () => {
      component.entry = undefined;
      expect(component.bookNames).toEqual([]);
      expect(component.buildRequestedByUserName).toBeUndefined();
      expect(component.buildRequestedByDate).toBe('');
      expect(component.canDownloadBuild).toBe(false);
      expect(component.hasDetails).toBe(false);
      expect(component.entry).toBeUndefined();
    });

    it('should handle builds with additional info', fakeAsync(() => {
      when(mockedI18nService.formatDate(anything())).thenReturn('formatted-date');
      when(mockedI18nService.localizeBook('GEN')).thenReturn('Genesis');
      when(mockedI18nService.localizeBook('EXO')).thenReturn('Exodus');
      const userDoc = {
        id: 'sf-user-id',
        data: createTestUserProfile({ displayName: 'user-display-name' })
      } as UserProfileDoc;
      when(mockedUserService.getProfile('sf-user-id')).thenResolve(userDoc);
      const targetProjectDoc = {
        id: 'project01',
        data: createTestProjectProfile({ shortName: 'tar', writingSystem: { tag: 'en' } })
      } as SFProjectProfileDoc;
      when(mockedSFProjectService.getProfile('project01')).thenResolve(targetProjectDoc);
      const sourceProjectDoc = {
        id: 'project02',
        data: createTestProjectProfile({ shortName: 'src', writingSystem: { tag: 'fr' } })
      } as SFProjectProfileDoc;
      when(mockedSFProjectService.getProfile('project02')).thenResolve(sourceProjectDoc);
      const entry = {
        engine: {
          id: 'project01'
        },
        additionalInfo: {
          dateGenerated: new Date().toISOString(),
          dateRequested: new Date().toISOString(),
          requestedByUserId: 'sf-user-id',
          trainingScriptureRanges: [{ projectId: 'project02', scriptureRange: 'EXO' }],
          translationScriptureRanges: [{ projectId: 'project01', scriptureRange: 'GEN' }]
        }
      } as BuildDto;

      // SUT
      component.entry = entry;
      tick();
      fixture.detectChanges();

      expect(component.bookNames).toEqual(['Genesis']);
      expect(component.buildRequestedByUserName).toBe('user-display-name');
      expect(component.buildRequestedByDate).toBe('formatted-date');
      expect(component.canDownloadBuild).toBe(true);
      expect(component.hasDetails).toBe(true);
      expect(component.entry).toBe(entry);
      expect(component.sourceLanguage).toBe('fr');
      expect(component.targetLanguage).toBe('en');
      expect(component.trainingData).toEqual([
        {
          bookNames: ['Exodus'],
          source: 'src',
          target: 'tar'
        }
      ]);
    }));

    it('should handle builds with additional info referencing a deleted user', fakeAsync(() => {
      when(mockedI18nService.formatDate(anything())).thenReturn('formatted-date');
      when(mockedI18nService.localizeBook('GEN')).thenReturn('localized-book');
      const userDoc = { id: 'sf-user-id', data: undefined } as UserProfileDoc;
      when(mockedUserService.getProfile(anything())).thenResolve(userDoc);
      const entry = {
        additionalInfo: {
          dateGenerated: new Date().toISOString(),
          dateRequested: new Date().toISOString(),
          requestedByUserId: 'sf-user-id',
          translationScriptureRanges: [{ projectId: 'project01', scriptureRange: 'GEN' }]
        }
      } as BuildDto;

      // SUT
      component.entry = entry;
      tick();
      fixture.detectChanges();

      expect(component.bookNames).toEqual(['localized-book']);
      expect(component.buildRequestedByUserName).toBeUndefined();
      expect(component.buildRequestedByDate).toBe('formatted-date');
      expect(component.canDownloadBuild).toBe(true);
      expect(component.hasDetails).toBe(true);
      expect(component.entry).toBe(entry);
    }));

    it('should handle builds with incomplete additional info', () => {
      const entry = { additionalInfo: {} } as BuildDto;
      component.entry = entry;
      expect(component.bookNames).toEqual([]);
      expect(component.buildRequestedByUserName).toBeUndefined();
      expect(component.buildRequestedByDate).toBe('');
      expect(component.canDownloadBuild).toBe(false);
      expect(component.hasDetails).toBe(false);
      expect(component.entry).toBe(entry);
    });

    it('should handle builds without additional info', () => {
      const entry = {} as BuildDto;
      component.entry = entry;
      expect(component.bookNames).toEqual([]);
      expect(component.buildRequestedByUserName).toBeUndefined();
      expect(component.buildRequestedByDate).toBe('');
      expect(component.canDownloadBuild).toBe(false);
      expect(component.hasDetails).toBe(false);
      expect(component.entry).toBe(entry);
    });
  });

  describe('formatDate', () => {
    it('should handle undefined values', () => {
      expect(component.formatDate(undefined)).toBe('');
    });

    it('should handle date values', () => {
      const date = new Date();
      when(mockedI18nService.formatDate(anything())).thenReturn('formatted-date');
      expect(component.formatDate(date.toISOString())).toBe('formatted-date');
    });
  });

  describe('getStatus', () => {
    it('should handle known build state strings', () => {
      expect(component.getStatus(BuildStates.Active)).not.toBeUndefined();
    });

    it('should handle unknown build state strings', () => {
      expect(component.getStatus('unknown build state' as BuildStates)).not.toBeUndefined();
    });
  });
});
