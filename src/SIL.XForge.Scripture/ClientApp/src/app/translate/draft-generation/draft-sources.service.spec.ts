import { fakeAsync, flush, TestBed } from '@angular/core/testing';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { projectToTranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-source-test-data';
import { BehaviorSubject } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../../environments/environment';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { DraftSourcesAsArrays, DraftSourcesService } from './draft-sources.service';

describe('DraftSourcesService', () => {
  let service: DraftSourcesService;
  const mockActivatedProjectService: ActivatedProjectService = mock(ActivatedProjectService);
  const mockProjectService: SFProjectService = mock(SFProjectService);
  const mockUserService: UserService = mock(UserService);

  configureTestingModule(() => ({
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: SFProjectService, useMock: mockProjectService },
      { provide: UserService, useMock: mockUserService }
    ]
  }));

  beforeEach(() => {
    when(mockUserService.getCurrentUser()).thenResolve({ data: undefined } as UserDoc);
    when(mockActivatedProjectService.projectId).thenReturn('project01');
    service = TestBed.inject(DraftSourcesService);
  });

  describe('getDraftProjectSources', () => {
    it('should load the projects if the user has permission', fakeAsync(() => done => {
      const targetProject = createTestProjectProfile({
        translateConfig: {
          source: {
            projectRef: 'source_project'
          },
          draftConfig: {
            alternateSource: {
              projectRef: 'alternate_source_project'
            },
            alternateTrainingSource: {
              projectRef: 'alternate_training_source_project'
            },
            alternateSourceEnabled: true,
            alternateTrainingSourceEnabled: true,
            additionalTrainingSource: {
              projectRef: 'additional_training_source_project'
            },
            additionalTrainingSourceEnabled: true
          }
        }
      });
      const sourceProject = createTestProjectProfile({
        name: 'Source Project',
        shortName: 'SP',
        texts: [{ bookNum: 1 }],
        writingSystem: {
          tag: 'en_US'
        }
      });
      const alternateSourceProject = createTestProjectProfile({
        name: 'Alternate Source Project',
        shortName: 'ASP',
        paratextId: 'PT_Source',
        texts: [{ bookNum: 1 }],
        writingSystem: {
          tag: 'en_NZ'
        },
        isRightToLeft: false
      });
      const alternateSource = projectToTranslateSource('alternate_source_project', alternateSourceProject);
      const alternateTrainingSourceProject = createTestProjectProfile({
        name: 'Alternate Training Source Project',
        shortName: 'ATSP',
        paratextId: 'PT_Alt_Training_Source',
        texts: [{ bookNum: 1 }],
        writingSystem: {
          tag: 'en_AU'
        },
        isRightToLeft: false
      });
      const alternateTrainingSource = projectToTranslateSource(
        'alternate_training_source_project',
        alternateTrainingSourceProject
      );
      const additionalTrainingSourceProject = createTestProjectProfile({
        name: 'Additional Training Source Project',
        shortName: 'ADSP',
        paratextId: 'PT_Additional_Training_Source',
        texts: [{ bookNum: 1 }],
        writingSystem: {
          tag: 'en_UK'
        }
      });
      const additionalTrainingSource = projectToTranslateSource(
        'additional_training_source_project',
        additionalTrainingSourceProject
      );
      when(mockActivatedProjectService.projectDoc$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>({
          id: 'project01',
          data: targetProject
        } as SFProjectProfileDoc)
      );
      when(mockProjectService.getProfile('source_project')).thenResolve({
        data: sourceProject
      } as SFProjectProfileDoc);
      when(mockProjectService.getProfile('alternate_source_project')).thenResolve({
        data: alternateSourceProject
      } as SFProjectProfileDoc);
      when(mockProjectService.getProfile('alternate_training_source_project')).thenResolve({
        data: alternateTrainingSourceProject
      } as SFProjectProfileDoc);
      when(mockProjectService.getProfile('additional_training_source_project')).thenResolve({
        data: additionalTrainingSourceProject
      } as SFProjectProfileDoc);
      when(mockUserService.getCurrentUser()).thenResolve({
        data: createTestUser(
          {
            sites: {
              [environment.siteId]: {
                projects: [
                  'source_project',
                  'alternate_source_project',
                  'alternate_training_source_project',
                  'additional_training_source_project'
                ]
              }
            }
          },
          1
        )
      } as UserDoc);

      when(mockProjectService.onlineGetDraftSources(anything())).thenResolve({
        trainingSources: [alternateTrainingSource, additionalTrainingSource],
        trainingTargets: [targetProject],
        draftingSources: [alternateSource]
      });
      service.getDraftProjectSources().subscribe(result => {
        expect(result).toEqual({
          trainingTargets: [{ ...targetProject, projectRef: 'project01' }],
          draftingSources: [{ ...alternateSourceProject, projectRef: 'alternate_source_project' }],
          trainingSources: [
            { ...alternateTrainingSourceProject, projectRef: 'alternate_training_source_project' },
            { ...additionalTrainingSourceProject, projectRef: 'additional_training_source_project' }
          ]
        } as DraftSourcesAsArrays);
        done();
      });
      flush();
    }));
  });
});
