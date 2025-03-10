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
import { DraftSource, DraftSourcesAsArrays, DraftSourcesService } from './draft-sources.service';

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
          trainingSources: [undefined, undefined],
          trainingTargets: [undefined],
          draftingSources: [undefined]
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
            alternateSource: {
              projectRef: 'alternate_source_project',
              paratextId: 'PT_ASP',
              name: 'Alternate Source Project',
              shortName: 'ASP',
              writingSystem: {
                tag: 'en_NZ'
              }
            },
            alternateTrainingSource: {
              projectRef: 'alternate_training_source_project',
              paratextId: 'PT_ATSP',
              name: 'Alternate Training Source Project',
              shortName: 'ATSP',
              writingSystem: {
                tag: 'en_AU'
              }
            },
            alternateSourceEnabled: true,
            alternateTrainingSourceEnabled: true,
            additionalTrainingSource: {
              projectRef: 'additional_training_source_project',
              paratextId: 'PT_ADSP',
              name: 'Additional Training Source Project',
              shortName: 'ADSP',
              writingSystem: {
                tag: 'en_UK'
              }
            },
            additionalTrainingSourceEnabled: true
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
              name: 'Alternate Source Project',
              projectRef: 'alternate_source_project',
              shortName: 'ASP',
              paratextId: 'PT_ASP',
              texts: [],
              writingSystem: {
                tag: 'en_NZ'
              },
              noAccess: true
            } as DraftSource
          ],
          trainingSources: [
            {
              name: 'Alternate Training Source Project',
              projectRef: 'alternate_training_source_project',
              shortName: 'ATSP',
              paratextId: 'PT_ATSP',
              texts: [],
              writingSystem: {
                tag: 'en_AU'
              },
              noAccess: true
            } as DraftSource,
            {
              name: 'Additional Training Source Project',
              projectRef: 'additional_training_source_project',
              shortName: 'ADSP',
              paratextId: 'PT_ADSP',
              texts: [],
              writingSystem: {
                tag: 'en_UK'
              },
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
        texts: [{ bookNum: 1 }],
        writingSystem: {
          tag: 'en_NZ'
        }
      });
      const alternateTrainingSourceProject = createTestProjectProfile({
        name: 'Alternate Training Source Project',
        shortName: 'ATSP',
        texts: [{ bookNum: 1 }],
        writingSystem: {
          tag: 'en_AU'
        }
      });
      const additionalTrainingSourceProject = createTestProjectProfile({
        name: 'Additional Training Source Project',
        shortName: 'ADSP',
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
    });

    it('should not pass the alternate source project if disabled', done => {
      const targetProject = createTestProjectProfile({
        translateConfig: {
          draftConfig: {
            alternateSource: {
              projectRef: 'alternate_source_project',
              name: 'Alternate Source Project',
              shortName: 'ASP',
              writingSystem: {
                tag: 'en_NZ'
              }
            },
            alternateSourceEnabled: false
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
        expectTargetOnly({ ...targetProject, projectRef: 'project01' }, result);
        done();
      });
    });

    it('should not pass the alternate source project if enabled but missing', done => {
      const targetProject = createTestProjectProfile({
        translateConfig: {
          draftConfig: {
            alternateSourceEnabled: true
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
        expectTargetOnly({ ...targetProject, projectRef: 'project01' }, result);
        done();
      });
    });

    it('should not pass the alternate training source project if disabled', done => {
      const targetProject = createTestProjectProfile({
        translateConfig: {
          draftConfig: {
            alternateTrainingSource: {
              projectRef: 'alternate_training_source_project',
              name: 'Alternate Training Source Project',
              shortName: 'ATSP',
              writingSystem: {
                tag: 'en_AU'
              }
            },
            alternateTrainingSourceEnabled: false
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
        expectTargetOnly({ ...targetProject, projectRef: 'project01' }, result);
        done();
      });
    });

    it('should not pass the alternate training source project if enabled but missing', done => {
      const targetProject = createTestProjectProfile({
        translateConfig: {
          draftConfig: {
            alternateTrainingSourceEnabled: true
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
        expectTargetOnly({ ...targetProject, projectRef: 'project01' }, result);
        done();
      });
    });

    it('should not pass the additional training source project if disabled', done => {
      const targetProject = createTestProjectProfile({
        translateConfig: {
          draftConfig: {
            additionalTrainingSource: {
              projectRef: 'additional_training_source_project',
              name: 'Additional Training Source Project',
              shortName: 'ADSP',
              writingSystem: {
                tag: 'en_UK'
              }
            },
            additionalTrainingSourceEnabled: false
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
        expectTargetOnly({ ...targetProject, projectRef: 'project01' }, result);
        done();
      });
    });

    it('should not pass the additional training source project if enabled but missing', done => {
      const targetProject = createTestProjectProfile({
        translateConfig: {
          draftConfig: {
            additionalTrainingSourceEnabled: true
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
        expectTargetOnly({ ...targetProject, projectRef: 'project01' }, result);
        done();
      });
    });
  });

  function expectTargetOnly(targetProject: DraftSource, result: DraftSourcesAsArrays): void {
    expect(result).toEqual({
      trainingSources: [undefined, undefined],
      trainingTargets: [targetProject],
      draftingSources: [undefined]
    } as DraftSourcesAsArrays);
  }
});
