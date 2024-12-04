import { TestBed } from '@angular/core/testing';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { BehaviorSubject } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { environment } from '../../../environments/environment';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { DraftSource, DraftSources, DraftSourcesService } from './draft-sources.service';

describe('DraftSourcesService', () => {
  let service: DraftSourcesService;
  let mockActivatedProjectService: ActivatedProjectService = mock(ActivatedProjectService);
  let mockProjectService: SFProjectService = mock(SFProjectService);
  let mockUserService: UserService = mock(UserService);

  configureTestingModule(() => ({
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: SFProjectService, useMock: mockProjectService },
      { provide: UserService, useMock: mockUserService }
    ]
  }));

  beforeEach(() => {
    when(mockUserService.getCurrentUser()).thenResolve({ data: undefined } as UserDoc);
    service = TestBed.inject(DraftSourcesService);
  });

  describe('getDraftProjectSources', () => {
    it('should pass undefined properties if no projects loaded', done => {
      when(mockActivatedProjectService.projectDoc$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>({ data: undefined } as SFProjectProfileDoc)
      );

      // SUT
      service.getDraftProjectSources().subscribe(result => {
        expect(result).toEqual({
          target: undefined,
          source: undefined,
          alternateSource: undefined,
          alternateTrainingSource: undefined,
          additionalTrainingSource: undefined,
          draftSourceIds: {
            draftingSourceId: undefined,
            draftingAlternateSourceId: undefined,
            trainingSourceId: undefined,
            trainingAlternateSourceId: undefined,
            trainingAdditionalSourceId: undefined
          }
        } as DraftSources);
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
            name: 'Source Project',
            shortName: 'SP',
            writingSystem: {
              tag: 'en_US'
            }
          },
          draftConfig: {
            alternateSource: {
              projectRef: 'alternate_source_project',
              name: 'Alternate Source Project',
              shortName: 'ASP',
              writingSystem: {
                tag: 'en_NZ'
              }
            },
            alternateTrainingSource: {
              projectRef: 'alternate_training_source_project',
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
      when(mockActivatedProjectService.projectDoc$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>({
          data: targetProject
        } as SFProjectProfileDoc)
      );

      service.getDraftProjectSources().subscribe(result => {
        expect(result).toEqual({
          target: targetProject,
          source: {
            name: 'Source Project',
            shortName: 'SP',
            texts: [{ bookNum: 2, hasSource: true } as TextInfo],
            writingSystem: {
              tag: 'en_US'
            },
            noAccess: true
          },
          alternateSource: {
            name: 'Alternate Source Project',
            shortName: 'ASP',
            texts: [],
            writingSystem: {
              tag: 'en_NZ'
            },
            noAccess: true
          },
          alternateTrainingSource: {
            name: 'Alternate Training Source Project',
            shortName: 'ATSP',
            texts: [],
            writingSystem: {
              tag: 'en_AU'
            },
            noAccess: true
          },
          additionalTrainingSource: {
            name: 'Additional Training Source Project',
            shortName: 'ADSP',
            texts: [],
            writingSystem: {
              tag: 'en_UK'
            },
            noAccess: true
          },
          draftSourceIds: {
            draftingSourceId: 'source_project',
            draftingAlternateSourceId: 'alternate_source_project',
            trainingSourceId: 'source_project',
            trainingAlternateSourceId: 'alternate_training_source_project',
            trainingAdditionalSourceId: 'additional_training_source_project'
          }
        } as DraftSources);
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
      when(mockActivatedProjectService.projectDoc$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>({
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
          target: targetProject,
          source: sourceProject,
          alternateSource: alternateSourceProject,
          alternateTrainingSource: alternateTrainingSourceProject,
          additionalTrainingSource: additionalTrainingSourceProject,
          draftSourceIds: {
            draftingSourceId: 'source_project',
            draftingAlternateSourceId: 'alternate_source_project',
            trainingSourceId: 'source_project',
            trainingAlternateSourceId: 'alternate_training_source_project',
            trainingAdditionalSourceId: 'additional_training_source_project'
          }
        } as DraftSources);
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
      when(mockActivatedProjectService.projectDoc$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>({
          data: targetProject
        } as SFProjectProfileDoc)
      );

      service.getDraftProjectSources().subscribe(result => {
        expectTargetOnly(targetProject, result);
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
      when(mockActivatedProjectService.projectDoc$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>({
          data: targetProject
        } as SFProjectProfileDoc)
      );

      service.getDraftProjectSources().subscribe(result => {
        expectTargetOnly(targetProject, result);
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
      when(mockActivatedProjectService.projectDoc$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>({
          data: targetProject
        } as SFProjectProfileDoc)
      );

      service.getDraftProjectSources().subscribe(result => {
        expectTargetOnly(targetProject, result);
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
      when(mockActivatedProjectService.projectDoc$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>({
          data: targetProject
        } as SFProjectProfileDoc)
      );

      service.getDraftProjectSources().subscribe(result => {
        expectTargetOnly(targetProject, result);
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
      when(mockActivatedProjectService.projectDoc$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>({
          data: targetProject
        } as SFProjectProfileDoc)
      );

      service.getDraftProjectSources().subscribe(result => {
        expectTargetOnly(targetProject, result);
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
      when(mockActivatedProjectService.projectDoc$).thenReturn(
        new BehaviorSubject<SFProjectProfileDoc>({
          data: targetProject
        } as SFProjectProfileDoc)
      );

      service.getDraftProjectSources().subscribe(result => {
        expectTargetOnly(targetProject, result);
        done();
      });
    });
  });

  function expectTargetOnly(targetProject: DraftSource, result: DraftSources): void {
    expect(result).toEqual({
      target: targetProject,
      source: undefined,
      alternateSource: undefined,
      alternateTrainingSource: undefined,
      additionalTrainingSource: undefined,
      draftSourceIds: {
        draftingSourceId: undefined,
        draftingAlternateSourceId: undefined,
        trainingSourceId: undefined,
        trainingAlternateSourceId: undefined,
        trainingAdditionalSourceId: undefined
      }
    } as DraftSources);
  }
});
