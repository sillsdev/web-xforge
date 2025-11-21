import { TestBed } from '@angular/core/testing';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { BehaviorSubject } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../../environments/environment';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { DraftSource, DraftSourcesAsArrays } from './draft-source';
import { DraftSourcesService } from './draft-sources.service';

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
    it('should pass undefined properties if no projects loaded', done => {
      when(mockActivatedProjectService.projectId).thenReturn(undefined);
      when(mockActivatedProjectService.changes$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>({ data: undefined } as SFProjectProfileDoc)
      );

      // SUT
      service.getDraftProjectSources().subscribe(result => {
        expect(result).toEqual({
          trainingSources: [],
          trainingTargets: [],
          draftingSources: []
        } as DraftSourcesAsArrays);
        done();
      });
    });

    it('should pass the values from the target project if no access', done => {
      const targetProject = createTestProjectProfile({
        texts: [
          { bookNum: 1, hasSource: false },
          { bookNum: 2, hasSource: true }
        ],
        translateConfig: {
          source: {
            projectRef: 'source_project',
            paratextId: 'PT_SP',
            name: 'Source Project',
            shortName: 'SP',
            writingSystem: {
              tag: 'en_US'
            }
          },
          draftConfig: {
            draftingSources: [
              {
                projectRef: 'first_drafting_source',
                paratextId: 'PT_FDS',
                name: 'First Drafting Source',
                shortName: 'FDS',
                writingSystem: {
                  tag: 'en_NZ'
                }
              }
            ],
            trainingSources: [
              {
                projectRef: 'first_training_source',
                paratextId: 'PT_FTS',
                name: 'First Training Source',
                shortName: 'FTS',
                writingSystem: {
                  tag: 'en_AU'
                }
              },
              {
                projectRef: 'second_training_source',
                paratextId: 'PT_STS',
                name: 'Second Training Source',
                shortName: 'STS',
                writingSystem: {
                  tag: 'en_UK'
                }
              }
            ]
          }
        }
      });
      when(mockActivatedProjectService.changes$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>({
          id: 'project01',
          data: targetProject
        } as SFProjectProfileDoc)
      );

      service.getDraftProjectSources().subscribe(result => {
        expect(result).toEqual({
          trainingTargets: [{ ...targetProject, projectRef: 'project01' }],
          draftingSources: [
            {
              ...targetProject.translateConfig.draftConfig.draftingSources[0],
              texts: [],
              noAccess: true
            } as DraftSource
          ],
          trainingSources: [
            {
              ...targetProject.translateConfig.draftConfig.trainingSources[0],
              texts: [],
              noAccess: true
            } as DraftSource,
            {
              ...targetProject.translateConfig.draftConfig.trainingSources[1],
              texts: [],
              noAccess: true
            } as DraftSource
          ]
        } as DraftSourcesAsArrays);
        done();
      });
    });

    it('should load the projects if the user has permission', done => {
      const targetProject = createTestProjectProfile({
        translateConfig: {
          source: {
            projectRef: 'source_project'
          },
          draftConfig: {
            draftingSources: [{ projectRef: 'first_drafting_source' }],
            trainingSources: [{ projectRef: 'first_training_source' }, { projectRef: 'second_training_source' }]
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
      const firstDraftingSourceProject = createTestProjectProfile({
        name: 'First Drafting Source Project',
        shortName: 'FDS',
        texts: [{ bookNum: 1 }],
        writingSystem: {
          tag: 'en_NZ'
        }
      });
      const firstTrainingSourceProject = createTestProjectProfile({
        name: 'First Training Source Project',
        shortName: 'FTS',
        texts: [{ bookNum: 1 }],
        writingSystem: {
          tag: 'en_AU'
        }
      });
      const secondTrainingSourceProject = createTestProjectProfile({
        name: 'Second Training Source Project',
        shortName: 'STS',
        texts: [{ bookNum: 1 }],
        writingSystem: {
          tag: 'en_UK'
        }
      });
      when(mockActivatedProjectService.changes$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>({
          id: 'project01',
          data: targetProject
        } as SFProjectProfileDoc)
      );
      when(mockProjectService.getProfile('source_project')).thenResolve({
        data: sourceProject
      } as SFProjectProfileDoc);
      when(mockProjectService.getProfile('first_drafting_source')).thenResolve({
        data: firstDraftingSourceProject
      } as SFProjectProfileDoc);
      when(mockProjectService.getProfile('first_training_source')).thenResolve({
        data: firstTrainingSourceProject
      } as SFProjectProfileDoc);
      when(mockProjectService.getProfile('second_training_source')).thenResolve({
        data: secondTrainingSourceProject
      } as SFProjectProfileDoc);
      when(mockUserService.getCurrentUser()).thenResolve({
        data: createTestUser(
          {
            sites: {
              [environment.siteId]: {
                projects: ['source_project', 'first_drafting_source', 'first_training_source', 'second_training_source']
              }
            }
          },
          1
        )
      } as UserDoc);

      service.getDraftProjectSources().subscribe(result => {
        expect(result).toEqual({
          trainingTargets: [{ ...targetProject, projectRef: 'project01' }],
          draftingSources: [{ ...firstDraftingSourceProject, projectRef: 'first_drafting_source' }],
          trainingSources: [
            { ...firstTrainingSourceProject, projectRef: 'first_training_source' },
            { ...secondTrainingSourceProject, projectRef: 'second_training_source' }
          ]
        } as DraftSourcesAsArrays);
        done();
      });
    });
  });
});
