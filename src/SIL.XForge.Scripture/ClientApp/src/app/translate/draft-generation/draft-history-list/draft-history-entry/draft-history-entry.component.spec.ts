import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { createTestUserProfile } from 'realtime-server/lib/esm/common/models/user-test-data';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import {
  DraftConfig,
  ParagraphBreakFormat,
  QuoteFormat,
  TranslateConfig
} from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { of } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../../core/models/sf-type-registry';
import { TrainingDataDoc } from '../../../../core/models/training-data-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { BuildDto } from '../../../../machine-api/build-dto';
import { BuildStates } from '../../../../machine-api/build-states';
import { DraftGenerationService } from '../../draft-generation.service';
import { TrainingDataService } from '../../training-data/training-data.service';
import { DraftHistoryEntryComponent } from './draft-history-entry.component';

const mockedDraftGenerationService = mock(DraftGenerationService);
const mockedI18nService = mock(I18nService);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedTrainingDataService = mock(TrainingDataService);
const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedFeatureFlagsService = mock(FeatureFlagService);

describe('DraftHistoryEntryComponent', () => {
  let component: DraftHistoryEntryComponent;
  let fixture: ComponentFixture<DraftHistoryEntryComponent>;

  configureTestingModule(() => ({
    imports: [
      NoopAnimationsModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      RouterModule.forRoot([])
    ],
    providers: [
      { provide: DraftGenerationService, useMock: mockedDraftGenerationService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: TrainingDataService, useMock: mockedTrainingDataService },
      { provide: ActivatedProjectService, useMock: mockedActivatedProjectService },
      { provide: FeatureFlagService, useMock: mockedFeatureFlagsService }
    ]
  }));

  beforeEach(() => {
    when(mockedFeatureFlagsService.usfmFormat).thenReturn(createTestFeatureFlag(true));
    when(mockedActivatedProjectService.projectId).thenReturn('project01');
    const trainingDataQuery: RealtimeQuery<TrainingDataDoc> = mock(RealtimeQuery<TrainingDataDoc>);
    when(trainingDataQuery.docs).thenReturn([
      { id: 'doc01', data: { dataId: 'file01', title: 'training-data.txt' } } as TrainingDataDoc
    ]);
    when(mockedTrainingDataService.queryTrainingDataAsync(anything(), anything())).thenResolve(
      instance(trainingDataQuery)
    );
    fixture = TestBed.createComponent(DraftHistoryEntryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('entry', () => {
    it('should handle undefined values', () => {
      component.entry = undefined;
      expect(component.scriptureRange).toEqual('');
      expect(component.buildRequestedByUserName).toBeUndefined();
      expect(component.buildRequestedAtDate).toBe('');
      expect(component.canDownloadBuild).toBe(false);
      expect(component.hasDetails).toBe(false);
      expect(component.entry).toBeUndefined();
    });

    it('should handle builds with additional info', fakeAsync(() => {
      when(mockedI18nService.enumerateList(anything())).thenReturn('src');
      const user = 'user-display-name';
      const date = 'formatted-date';
      const trainingBooks = ['EXO'];
      const translateBooks = ['GEN'];
      const trainingDataFiles: Map<string, string> = new Map([['file01', 'training-data.txt']]);
      const entry = getStandardBuildDto({
        user,
        date,
        trainingBooks,
        translateBooks,
        trainingDataFiles: Array.from(trainingDataFiles.keys())
      });

      // SUT
      component.entry = entry;
      tick();
      fixture.detectChanges();

      expect(component.scriptureRange).toEqual('Genesis');
      expect(component.translationSource).toEqual('src \u2022');
      expect(component.buildRequestedByUserName).toBe(user);
      expect(component.buildRequestedAtDate).toBe(date);
      expect(component.canDownloadBuild).toBe(true);
      expect(fixture.nativeElement.querySelector('.format-usfm')).toBeNull();
      expect(component.columnsToDisplay).toEqual(['scriptureRange', 'source', 'target']);
      expect(component.hasDetails).toBe(true);
      expect(component.entry).toBe(entry);
      expect(component.sourceLanguage).toBe('fr');
      expect(component.targetLanguage).toBe('en');
      expect(component.trainingConfiguration).toEqual([
        {
          scriptureRange: 'Exodus',
          source: 'src',
          target: 'tar'
        }
      ]);
      expect(component.trainingDataFiles).toEqual(Array.from(trainingDataFiles.values()));
      expect(component.trainingConfigurationOpen).toBe(false);
      expect(fixture.nativeElement.querySelector('.requested-label')).not.toBeNull();
    }));

    it('should state that the model did not have training configuration', fakeAsync(() => {
      when(mockedI18nService.enumerateList(anything())).thenReturn('src');
      const user = 'user-display-name';
      const date = 'formatted-date';
      const trainingBooks = [];
      const translateBooks = ['GEN'];
      const trainingDataFiles = [];
      const entry = getStandardBuildDto({ user, date, trainingBooks, translateBooks, trainingDataFiles });

      // SUT
      component.entry = entry;
      tick();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelector('.no-training-configuration')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.requested-label')).not.toBeNull();
    }));

    it('should show the USFM format option when the project is the latest draft', fakeAsync(() => {
      const user = 'user-display-name';
      const date = 'formatted-date';
      const trainingBooks = ['EXO'];
      const translateBooks = ['GEN'];
      const trainingDataFiles = ['file01'];
      const entry = getStandardBuildDto({ user, date, trainingBooks, translateBooks, trainingDataFiles });

      // SUT
      component.entry = entry;
      component.isLatestBuild = true;
      tick();
      fixture.detectChanges();

      expect(component.scriptureRange).toEqual('Genesis');
      expect(component.canDownloadBuild).toBe(true);
      expect(fixture.nativeElement.querySelector('.format-usfm')).not.toBeNull();
    }));

    it('should handle builds where the draft cannot be downloaded yet', fakeAsync(() => {
      when(mockedI18nService.formatAndLocalizeScriptureRange('GEN')).thenReturn('Genesis');
      when(mockedI18nService.formatAndLocalizeScriptureRange('EXO')).thenReturn('Exodus');
      when(mockedI18nService.translateStatic('draft_history_entry.draft_unknown')).thenReturn('Unknown');
      const targetProjectDoc = {
        id: 'project01'
      } as SFProjectProfileDoc;
      when(mockedSFProjectService.getProfile('project01')).thenResolve(targetProjectDoc);
      const sourceProjectDoc = {
        id: 'project02'
      } as SFProjectProfileDoc;
      when(mockedSFProjectService.getProfile('project02')).thenResolve(sourceProjectDoc);
      const entry = {
        engine: {
          id: 'project01'
        },
        additionalInfo: {
          trainingScriptureRanges: [{ projectId: 'project02', scriptureRange: 'EXO' }],
          translationScriptureRanges: [{ projectId: 'project02', scriptureRange: 'GEN' }]
        }
      } as BuildDto;

      // SUT
      component.entry = entry;
      component.isLatestBuild = true;
      tick();
      fixture.detectChanges();

      expect(component.scriptureRange).toEqual('Genesis');
      expect(component.translationSource).toEqual('');
      expect(component.buildRequestedByUserName).toBeUndefined();
      expect(component.buildRequestedAtDate).toBe('');
      expect(component.canDownloadBuild).toBe(false);
      expect(fixture.nativeElement.querySelector('.format-usfm')).toBeNull();
      expect(component.columnsToDisplay).toEqual(['scriptureRange', 'source', 'target']);
      expect(component.hasDetails).toBe(true);
      expect(component.entry).toBe(entry);
      expect(component.sourceLanguage).toBe('');
      expect(component.targetLanguage).toBe('');
      expect(component.trainingConfiguration).toEqual([
        {
          scriptureRange: 'Exodus',
          source: 'Unknown',
          target: 'Unknown'
        }
      ]);
      expect(component.trainingConfigurationOpen).toBe(true);
    }));

    it('should handle builds with additional info referencing a deleted user', fakeAsync(() => {
      when(mockedI18nService.formatDate(anything())).thenReturn('formatted-date');
      when(mockedI18nService.formatAndLocalizeScriptureRange('GEN')).thenReturn('Genesis');
      when(mockedI18nService.formatAndLocalizeScriptureRange('EXO')).thenReturn('Exodus');
      const userDoc = { id: 'sf-user-id', data: undefined } as UserProfileDoc;
      when(mockedUserService.getProfile(anything())).thenResolve(userDoc);
      const targetProjectDoc = {
        id: 'project01',
        data: createTestProjectProfile({ shortName: 'tar', writingSystem: { tag: 'en' } })
      } as SFProjectProfileDoc;
      when(mockedSFProjectService.getProfile('project01')).thenResolve(targetProjectDoc);
      when(mockedActivatedProjectService.changes$).thenReturn(of(targetProjectDoc));
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
      component.isLatestBuild = true;
      tick();
      fixture.detectChanges();

      expect(component.scriptureRange).toEqual('Genesis');
      expect(component.buildRequestedByUserName).toBeUndefined();
      expect(component.buildRequestedAtDate).toBe('formatted-date');
      expect(component.canDownloadBuild).toBe(true);
      expect(fixture.nativeElement.querySelector('.format-usfm')).not.toBeNull();
      expect(component.hasDetails).toBe(true);
      expect(component.entry).toBe(entry);
    }));

    it('should handle builds with incomplete additional info', () => {
      const entry = { additionalInfo: {} } as BuildDto;
      component.entry = entry;
      component.isLatestBuild = true;
      expect(component.scriptureRange).toEqual('');
      expect(component.buildRequestedByUserName).toBeUndefined();
      expect(component.buildRequestedAtDate).toBe('');
      expect(component.canDownloadBuild).toBe(false);
      expect(fixture.nativeElement.querySelector('.format-usfm')).toBeNull();
      expect(component.hasDetails).toBe(false);
      expect(component.entry).toBe(entry);
    });

    it('should handle builds without additional info', () => {
      const entry = {} as BuildDto;
      component.entry = entry;
      expect(component.scriptureRange).toEqual('');
      expect(component.buildRequestedByUserName).toBeUndefined();
      expect(component.buildRequestedAtDate).toBe('');
      expect(component.canDownloadBuild).toBe(false);
      expect(component.hasDetails).toBe(false);
      expect(component.entry).toBe(entry);
    });

    it('should handle faulted builds with additional info', () => {
      const entry = {
        state: BuildStates.Faulted,
        message: 'An error occurred',
        engine: { id: 'project01' },
        additionalInfo: {
          translationEngineId: 'translationEngine01',
          buildId: 'build01',
          corporaIds: ['corpora01'],
          parallelCorporaIds: ['parallelCorpora01']
        }
      } as BuildDto;
      component.entry = entry;
      expect(component.scriptureRange).toEqual('');
      expect(component.buildRequestedByUserName).toBeUndefined();
      expect(component.buildRequestedAtDate).toBe('');
      expect(component.canDownloadBuild).toBe(false);
      expect(component.hasDetails).toBe(true);
      expect(component.entry).toBe(entry);
      expect(component.buildFaulted).toBe(true);
      expect(component.buildFaultDetails.length).toBe(6);
    });

    it('should handle faulted builds without additional info', () => {
      const entry = {
        state: BuildStates.Faulted,
        message: 'An error occurred',
        engine: { id: 'project01' }
      } as BuildDto;
      component.entry = entry;
      expect(component.scriptureRange).toEqual('');
      expect(component.buildRequestedByUserName).toBeUndefined();
      expect(component.buildRequestedAtDate).toBe('');
      expect(component.canDownloadBuild).toBe(false);
      expect(component.hasDetails).toBe(true);
      expect(component.entry).toBe(entry);
      expect(component.buildFaulted).toBe(true);
      expect(component.buildFaultDetails.length).toBe(2);
    });
  });

  describe('setDraftFormat', () => {
    it('should show set draft format UI', fakeAsync(() => {
      when(mockedActivatedProjectService.projectDoc).thenReturn(getProjectProfileDoc());
      component.entry = { id: 'build01', state: BuildStates.Completed, message: 'Completed' } as BuildDto;
      component.isLatestBuild = true;
      tick();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.require-formatting-options')).not.toBeNull();
    }));

    it('should hide draft format UI', fakeAsync(() => {
      when(mockedActivatedProjectService.projectDoc).thenReturn(
        getProjectProfileDoc({
          translateConfig: {
            draftConfig: {
              usfmConfig: { paragraphFormat: ParagraphBreakFormat.BestGuess, quoteFormat: QuoteFormat.Denormalized }
            } as DraftConfig
          } as TranslateConfig
        })
      );
      component.entry = { id: 'build01', state: BuildStates.Completed, message: 'Completed' } as BuildDto;
      component.isLatestBuild = true;
      tick();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.require-formatting-options')).toBeNull();
    }));
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
      expect(component.getStatus(BuildStates.Active)).toBeDefined();
    });

    it('should handle unknown build state strings', () => {
      expect(component.getStatus('unknown build state' as BuildStates)).toBeDefined();
    });
  });

  function getStandardBuildDto({
    user,
    date,
    trainingBooks,
    translateBooks,
    trainingDataFiles
  }: {
    user: string;
    date: string;
    trainingBooks: string[];
    translateBooks: string[];
    trainingDataFiles: string[];
  }): BuildDto {
    when(mockedI18nService.formatDate(anything())).thenReturn(date);
    when(mockedI18nService.formatAndLocalizeScriptureRange('GEN')).thenReturn('Genesis');
    when(mockedI18nService.formatAndLocalizeScriptureRange('EXO')).thenReturn('Exodus');
    const userDoc = {
      id: 'sf-user-id',
      data: createTestUserProfile({ displayName: user })
    } as UserProfileDoc;
    when(mockedUserService.getProfile('sf-user-id')).thenResolve(userDoc);
    const targetProjectDoc = {
      id: 'project01',
      data: createTestProjectProfile({ shortName: 'tar', writingSystem: { tag: 'en' } })
    } as SFProjectProfileDoc;
    when(mockedSFProjectService.getProfile('project01')).thenResolve(targetProjectDoc);
    when(mockedActivatedProjectService.changes$).thenReturn(of(targetProjectDoc));
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
        trainingScriptureRanges:
          trainingBooks.length > 0 ? [{ projectId: 'project02', scriptureRange: trainingBooks.join(';') }] : [],
        translationScriptureRanges: [{ projectId: 'project02', scriptureRange: translateBooks.join(';') }],
        trainingDataFileIds: trainingDataFiles
      }
    } as BuildDto;

    return entry;
  }

  function getProjectProfileDoc(args: Partial<SFProjectProfile> = {}): SFProjectProfileDoc {
    const targetProjectDoc = {
      id: 'project01',
      data: createTestProjectProfile({ ...args })
    } as SFProjectProfileDoc;
    return targetProjectDoc;
  }
});
