import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Route, RouterModule } from '@angular/router';
import { cloneDeep, merge } from 'lodash-es';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { RecursivePartial } from 'realtime-server/lib/esm/common/utils/type-utils';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import { createTestTextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio-test-data';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { of } from 'rxjs';
import { anything, capture, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { noopDestroyRef } from 'xforge-common/realtime.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { WriteStatusComponent } from 'xforge-common/write-status/write-status.component';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { TextAudioDoc } from '../core/models/text-audio-doc';
import { ParatextService, SelectableProject } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';
import { ProjectSelectComponent } from '../project-select/project-select.component';
import { InfoComponent } from '../shared/info/info.component';
import { DeleteProjectDialogComponent } from './delete-project-dialog/delete-project-dialog.component';
import { SettingsComponent } from './settings.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedAuthService = mock(AuthService);
const mockedNoticeService = mock(NoticeService);
const mockedParatextService = mock(ParatextService);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedDialog = mock(MatDialog);
const mockedFeatureFlagService = mock(FeatureFlagService);

@Component({
  template: `<div>Mock</div>`
})
class MockComponent {}

const ROUTES: Route[] = [{ path: 'projects', component: MockComponent }];

describe('SettingsComponent', () => {
  configureTestingModule(() => ({
    imports: [
      RouterModule.forRoot(ROUTES),
      UICommonModule,
      TestTranslocoModule,
      TranslocoMarkupModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      TestOnlineStatusModule.forRoot(),
      NoopAnimationsModule
    ],
    declarations: [SettingsComponent, WriteStatusComponent, ProjectSelectComponent, InfoComponent],
    providers: [
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: FeatureFlagService, useValue: instance(mockedFeatureFlagService) },
      { provide: MatDialog, useMock: mockedDialog }
    ]
  }));

  describe('Tasks', () => {
    it('should select Checking and then submit update when clicked', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.wait();
      expect(env.inputElement(env.checkingCheckbox).checked).toBe(false);
      env.clickElement(env.inputElement(env.checkingCheckbox));
      tick();
      env.fixture.detectChanges();
      expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);
      expect(env.statusDone(env.checkingStatus)).not.toBeNull();
    }));

    it('changing state of top-level setting results in status icon', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.wait();
      expect(env.statusDone(env.checkingStatus)).toBeNull();
      expect(env.inputElement(env.checkingCheckbox).checked).toBe(false);
      env.clickElement(env.inputElement(env.checkingCheckbox));
      tick();
      env.fixture.detectChanges();
      expect(env.statusDone(env.checkingStatus)).not.toBeNull();

      expect(env.statusDone(env.translationSuggestionsStatus)).toBeNull();
      expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
      env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
      tick();
      env.fixture.detectChanges();
      expect(env.statusDone(env.translationSuggestionsStatus)).not.toBeNull();
    }));

    it('error on data submit shows error icon', fakeAsync(() => {
      const env = new TestEnvironment();
      when(
        mockedSFProjectService.onlineUpdateSettings('project01', deepEqual({ usersSeeEachOthersResponses: true }))
      ).thenReject(new Error('Network error'));
      env.setupProject();
      env.wait();
      env.clickElement(env.inputElement(env.checkingCheckbox));
      expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);

      // prove 'error status' elements are absent
      expect(env.statusError(env.seeOthersResponsesStatus)).toBeNull();
      expect(env.inputElement(env.seeOthersResponsesCheckbox).checked).toBe(false);
      env.clickElement(env.inputElement(env.seeOthersResponsesCheckbox));
      tick();
      env.fixture.detectChanges();
      // 'error status' elements should now be present
      expect(env.statusError(env.seeOthersResponsesStatus)).not.toBeNull();
    }));

    it('disables form when user is offline', fakeAsync(() => {
      const env = new TestEnvironment(false);
      env.setupProject();
      env.wait();
      expect(env.offlineMessage).not.toBeNull();
      expect(env.deleteProjectButton.disabled).toBe(true);
      expect(env.component.form.disabled).toBe(true);
      env.onlineStatus = true;
      expect(env.offlineMessage).toBeNull();
      expect(env.deleteProjectButton.disabled).toBe(false);
      expect(env.component.form.enabled).toBe(true);
    }));

    it('enables form even when projects and resources fail to load', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.component.form.disabled).toBe(true);
      env.setupProject();
      when(mockedParatextService.getProjects()).thenReject(new Error('Project loading failed'));
      when(mockedParatextService.getResources()).thenReject(new Error('Resource loading failed'));
      env.wait();

      expect(env.component.form.disabled).toBe(false);
      expect(env.inputElement(env.translationSuggestionsCheckbox).disabled).toBe(false);
      expect(env.basedOnSelectErrorMessage.textContent).toContain('error fetching projects and resources');
      expect(env.basedOnSelectComponent.isDisabled).toBe(true);
    }));

    it('enables form even when projects fail to load', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.component.form.disabled).toBe(true);
      env.setupProject();
      when(mockedParatextService.getProjects()).thenReject(new Error('Project loading failed'));
      env.wait();

      expect(env.component.form.disabled).toBe(false);
      expect(env.basedOnSelectErrorMessage.textContent).toContain('error fetching projects.');
      expect(env.basedOnSelectComponent.isDisabled).toBe(false);
      expect(env.inputElement(env.translationSuggestionsCheckbox).disabled).toBe(false);
    }));

    it('enables form even when resources fail to load', fakeAsync(() => {
      const env = new TestEnvironment();
      expect(env.component.form.disabled).toBe(true);
      env.setupProject();
      when(mockedParatextService.getResources()).thenReject(new Error('Resource loading failed'));
      env.wait();

      expect(env.component.form.disabled).toBe(false);
      expect(env.basedOnSelectErrorMessage.textContent).toContain('error fetching the Digital Bible Library resources');
      expect(env.basedOnSelectComponent.isDisabled).toBe(false);
      expect(env.inputElement(env.translationSuggestionsCheckbox).disabled).toBe(false);
    }));

    describe('Alternate Source Dropdown', () => {
      it('should change alternate source select value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            draftConfig: {
              alternateSourceEnabled: true
            },
            preTranslate: true
          }
        });
        env.wait();
        env.wait();
        expect(env.alternateSourceSelect).not.toBeNull();
        expect(env.alternateSourceSelectValue).toBe('');
        expect(env.statusDone(env.alternateSourceStatus)).toBeNull();

        env.setAlternateSourceValue('paratextId02');

        expect(env.alternateSourceSelectValue).toContain('ParatextP2');
        expect(env.statusDone(env.alternateSourceStatus)).not.toBeNull();
      }));

      it('should display alternate source project even if user is not a member', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            draftConfig: {
              alternateSource: {
                paratextId: 'paratextId01',
                projectRef: 'paratext01',
                name: 'ParatextP1',
                shortName: 'PT1',
                writingSystem: {
                  tag: 'qaa'
                }
              },
              alternateSourceEnabled: true
            },
            preTranslate: true
          }
        });
        when(mockedParatextService.getProjects()).thenResolve([
          {
            paratextId: 'paratextId02',
            name: 'ParatextP2',
            shortName: 'PT2',
            languageTag: 'qaa',
            isConnectable: true,
            isConnected: false
          }
        ]);
        when(mockedParatextService.getResources()).thenResolve([]);

        env.wait();
        env.wait();
        expect(env.alternateSourceSelect).not.toBeNull();
        expect(env.alternateSourceSelectValue).toBe('ParatextP1');
        expect(env.alternateSourceSelectProjectsResources.length).toEqual(1);
        expect(env.alternateSourceSelectProjectsResources[0].name).toBe('ParatextP2');
      }));

      it('should display projects then resources', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: true,
            draftConfig: {
              alternateSourceEnabled: true
            }
          }
        });
        env.wait();
        env.wait();
        expect(env.alternateSourceSelect).not.toBeNull();
        expect(env.alternateSourceSelectProjectsResources.length).toEqual(5);
        expect(env.alternateSourceSelectProjectsResources[1].name).toBe('ParatextP2');
        expect(env.alternateSourceSelectProjectsResources[2].name).toBe('Sob Jonah and Luke');
      }));

      it('should display for back translations for serval administrators', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: false,
            draftConfig: {
              alternateSourceEnabled: true
            },
            projectType: ProjectType.BackTranslation
          }
        });
        when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
        env.wait();
        env.wait();
        expect(env.alternateSourceSelect).not.toBeNull();
      }));

      it('should display for forward translations', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: true,
            draftConfig: {
              alternateSourceEnabled: true
            }
          }
        });
        env.wait();
        env.wait();
        expect(env.alternateSourceSelect).not.toBeNull();
      }));

      it('should hide alternate source dropdown when alternate source is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        expect(env.inputElement(env.alternateSourceCheckbox).checked).toBe(false);
        expect(env.alternateSourceSelect).toBeNull();
        env.clickElement(env.inputElement(env.alternateSourceCheckbox));
        expect(env.inputElement(env.alternateSourceCheckbox).checked).toBe(true);
        expect(env.alternateSourceSelect).not.toBeNull();
      }));

      it('should not display for back translations', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: true,
            draftConfig: {
              alternateSourceEnabled: true
            },
            projectType: ProjectType.BackTranslation
          }
        });
        env.wait();
        env.wait();
        expect(env.alternateSourceSelect).toBeNull();
      }));

      it('should not display when the feature flag is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        when(mockedFeatureFlagService.showNmtDrafting).thenReturn(createTestFeatureFlag(false));
        env.wait();
        env.wait();
        expect(env.alternateSourceSelect).toBeNull();
      }));

      it('should not display for forward translations when not approved', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: false,
            draftConfig: {
              alternateSourceEnabled: true
            }
          }
        });
        env.wait();
        env.wait();
        expect(env.alternateSourceSelect).toBeNull();
      }));

      it('should unset alternate source select value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            draftConfig: {
              alternateSource: {
                paratextId: 'paratextId01',
                projectRef: 'paratext01',
                name: 'ParatextP1',
                shortName: 'PT1',
                writingSystem: {
                  tag: 'qaa'
                }
              },
              alternateSourceEnabled: true
            },
            preTranslate: true
          }
        });
        env.wait();
        env.wait();
        expect(env.alternateSourceSelect).not.toBeNull();
        expect(env.alternateSourceSelectValue).toContain('ParatextP1');
        expect(env.statusDone(env.alternateSourceStatus)).toBeNull();

        env.resetAlternateSourceProject();

        expect(env.alternateSourceSelectValue).toBe('');
        expect(env.statusDone(env.alternateSourceStatus)).not.toBeNull();
      }));
    });

    describe('Alternate Training Source', () => {
      it('should change alternate training source select value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            draftConfig: {
              alternateTrainingSourceEnabled: true
            },
            preTranslate: true
          }
        });
        env.wait();
        env.wait();
        expect(env.alternateTrainingSourceSelect).not.toBeNull();
        expect(env.alternateTrainingSourceSelectValue).toBe('');
        expect(env.statusDone(env.alternateTrainingSourceStatus)).toBeNull();

        env.setAlternateTrainingSourceValue('paratextId02');

        expect(env.alternateTrainingSourceSelectValue).toContain('ParatextP2');
        expect(env.statusDone(env.alternateTrainingSourceStatus)).not.toBeNull();
      }));

      it('should display alternate training source project even if user is not a member', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            draftConfig: {
              alternateTrainingSource: {
                paratextId: 'paratextId01',
                projectRef: 'paratext01',
                name: 'ParatextP1',
                shortName: 'PT1',
                writingSystem: {
                  tag: 'qaa'
                }
              },
              alternateTrainingSourceEnabled: true
            },
            preTranslate: true
          }
        });
        when(mockedParatextService.getProjects()).thenResolve([
          {
            paratextId: 'paratextId02',
            name: 'ParatextP2',
            shortName: 'PT2',
            languageTag: 'qaa',
            isConnectable: true,
            isConnected: false
          }
        ]);
        when(mockedParatextService.getResources()).thenResolve([]);

        env.wait();
        env.wait();
        expect(env.alternateTrainingSourceSelect).not.toBeNull();
        expect(env.alternateTrainingSourceSelectValue).toBe('ParatextP1');
        expect(env.alternateTrainingSourceSelectProjectsResources.length).toEqual(1);
        expect(env.alternateTrainingSourceSelectProjectsResources[0].name).toBe('ParatextP2');
      }));

      it('should display projects then resources', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            draftConfig: {
              alternateTrainingSourceEnabled: true
            },
            preTranslate: true
          }
        });
        env.wait();
        env.wait();
        expect(env.inputElement(env.alternateTrainingSourceCheckbox).checked).toBe(true);
        expect(env.alternateTrainingSourceSelect).not.toBeNull();
        expect(env.alternateTrainingSourceSelectProjectsResources.length).toEqual(5);
        expect(env.alternateTrainingSourceSelectProjectsResources[1].name).toBe('ParatextP2');
        expect(env.alternateTrainingSourceSelectProjectsResources[2].name).toBe('Sob Jonah and Luke');
      }));

      it('should display for back translations for serval administrators', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: false,
            draftConfig: {
              alternateTrainingSourceEnabled: true
            },
            projectType: ProjectType.BackTranslation
          }
        });
        when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
        env.wait();
        env.wait();
        expect(env.alternateTrainingSourceSelect).not.toBeNull();
      }));

      it('should display for forward translations', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: true,
            draftConfig: {
              alternateTrainingSourceEnabled: true
            }
          }
        });
        env.wait();
        env.wait();
        expect(env.alternateTrainingSourceSelect).not.toBeNull();
      }));

      it('should hide alternate training source dropdown when alternate training source is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        expect(env.inputElement(env.alternateTrainingSourceCheckbox).checked).toBe(false);
        expect(env.alternateTrainingSourceSelect).toBeNull();
        env.clickElement(env.inputElement(env.alternateTrainingSourceCheckbox));
        expect(env.inputElement(env.alternateTrainingSourceCheckbox).checked).toBe(true);
        expect(env.alternateTrainingSourceSelect).not.toBeNull();
      }));

      it('should not display for back translations', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: true,
            draftConfig: {
              alternateTrainingSourceEnabled: true
            },
            projectType: ProjectType.BackTranslation
          }
        });
        env.wait();
        env.wait();
        expect(env.alternateTrainingSourceSelect).toBeNull();
      }));

      it('should not display when the feature flag is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        when(mockedFeatureFlagService.showNmtDrafting).thenReturn(createTestFeatureFlag(false));
        env.wait();
        env.wait();
        expect(env.alternateTrainingSourceSelect).toBeNull();
      }));

      it('should not display for forward translations when not approved', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: false,
            draftConfig: {
              alternateTrainingSourceEnabled: true
            }
          }
        });
        env.wait();
        env.wait();
        expect(env.alternateTrainingSourceSelect).toBeNull();
      }));

      it('should unset alternate training source select value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            draftConfig: {
              alternateTrainingSource: {
                paratextId: 'paratextId01',
                projectRef: 'paratext01',
                name: 'ParatextP1',
                shortName: 'PT1',
                writingSystem: {
                  tag: 'qaa'
                }
              },
              alternateTrainingSourceEnabled: true
            },
            preTranslate: true
          }
        });
        env.wait();
        env.wait();
        expect(env.alternateTrainingSourceSelect).not.toBeNull();
        expect(env.alternateTrainingSourceSelectValue).toContain('ParatextP1');
        expect(env.statusDone(env.alternateTrainingSourceStatus)).toBeNull();

        env.resetAlternateTrainingSourceProject();

        expect(env.alternateTrainingSourceSelectValue).toBe('');
        expect(env.statusDone(env.alternateTrainingSourceStatus)).not.toBeNull();
      }));
    });

    describe('Additional Training Sources', () => {
      it('should change additional training source select value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            draftConfig: {
              additionalTrainingSourceEnabled: true
            },
            preTranslate: true
          }
        });
        env.wait();
        env.wait();
        expect(env.additionalTrainingSourceSelect).not.toBeNull();
        expect(env.additionalTrainingSourceSelectValue).toBe('');
        expect(env.statusDone(env.additionalTrainingSourceStatus)).toBeNull();

        env.setAdditionalTrainingSourceValue('paratextId02');

        expect(env.additionalTrainingSourceSelectValue).toContain('ParatextP2');
        expect(env.statusDone(env.additionalTrainingSourceStatus)).not.toBeNull();
      }));

      it('should display additional training source project even if user is not a member', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            draftConfig: {
              additionalTrainingSource: {
                paratextId: 'paratextId01',
                projectRef: 'paratext01',
                name: 'ParatextP1',
                shortName: 'PT1',
                writingSystem: {
                  tag: 'qaa'
                }
              },
              additionalTrainingSourceEnabled: true
            },
            preTranslate: true
          }
        });
        when(mockedParatextService.getProjects()).thenResolve([
          {
            paratextId: 'paratextId02',
            name: 'ParatextP2',
            shortName: 'PT2',
            languageTag: 'qaa',
            isConnectable: true,
            isConnected: false
          }
        ]);
        when(mockedParatextService.getResources()).thenResolve([]);

        env.wait();
        env.wait();
        expect(env.additionalTrainingSourceSelect).not.toBeNull();
        expect(env.additionalTrainingSourceSelectValue).toBe('ParatextP1');
        expect(env.additionalTrainingSourceSelectProjectsResources.length).toEqual(1);
        expect(env.additionalTrainingSourceSelectProjectsResources[0].name).toBe('ParatextP2');
      }));

      it('should display projects then resources', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            draftConfig: {
              additionalTrainingSourceEnabled: true
            },
            preTranslate: true
          }
        });
        env.wait();
        env.wait();
        expect(env.inputElement(env.additionalTrainingSourceCheckbox).checked).toBe(true);
        expect(env.additionalTrainingSourceSelect).not.toBeNull();
        expect(env.additionalTrainingSourceSelectProjectsResources.length).toEqual(5);
        expect(env.additionalTrainingSourceSelectProjectsResources[1].name).toBe('ParatextP2');
        expect(env.additionalTrainingSourceSelectProjectsResources[2].name).toBe('Sob Jonah and Luke');
      }));

      it('should display for back translations for serval administrators', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: false,
            draftConfig: {
              additionalTrainingSourceEnabled: true
            },
            projectType: ProjectType.BackTranslation
          }
        });
        when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
        env.wait();
        env.wait();
        expect(env.additionalTrainingSourceSelect).not.toBeNull();
      }));

      it('should display for forward translations', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: true,
            draftConfig: {
              additionalTrainingSourceEnabled: true
            }
          }
        });
        env.wait();
        env.wait();
        expect(env.additionalTrainingSourceSelect).not.toBeNull();
      }));

      it('should hide additional training source dropdown when additional training source is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        expect(env.inputElement(env.additionalTrainingSourceCheckbox).checked).toBe(false);
        expect(env.additionalTrainingSourceSelect).toBeNull();
        env.clickElement(env.inputElement(env.additionalTrainingSourceCheckbox));
        expect(env.inputElement(env.additionalTrainingSourceCheckbox).checked).toBe(true);
        expect(env.additionalTrainingSourceSelect).not.toBeNull();
      }));

      it('should not display for back translations', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: true,
            draftConfig: {
              additionalTrainingSourceEnabled: true
            },
            projectType: ProjectType.BackTranslation
          }
        });
        env.wait();
        env.wait();
        expect(env.additionalTrainingSourceSelect).toBeNull();
      }));

      it('should not display when the nmt drafting feature flag is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        when(mockedFeatureFlagService.showNmtDrafting).thenReturn(createTestFeatureFlag(false));
        env.wait();
        env.wait();
        expect(env.additionalTrainingSourceSelect).toBeNull();
      }));

      it('should not display when the additional training source feature flag is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        when(mockedFeatureFlagService.allowAdditionalTrainingSource).thenReturn(createTestFeatureFlag(false));
        env.wait();
        expect(env.additionalTrainingSourceCheckbox).toBeNull();
      }));

      it('should display when the feature flag is disabled and the additional source is enabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: true,
            draftConfig: {
              additionalTrainingSourceEnabled: true
            }
          }
        });
        when(mockedFeatureFlagService.allowAdditionalTrainingSource).thenReturn(createTestFeatureFlag(false));
        env.wait();
        expect(env.additionalTrainingSourceCheckbox).not.toBeNull();
        expect(env.inputElement(env.additionalTrainingSourceCheckbox).checked).toBe(true);
      }));

      it('should not display for forward translations when not approved', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: false,
            draftConfig: {
              additionalTrainingSourceEnabled: true
            }
          }
        });
        env.wait();
        env.wait();
        expect(env.additionalTrainingSourceSelect).toBeNull();
      }));

      it('should unset additional training source select value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            draftConfig: {
              additionalTrainingSource: {
                paratextId: 'paratextId01',
                projectRef: 'paratext01',
                name: 'ParatextP1',
                shortName: 'PT1',
                writingSystem: {
                  tag: 'qaa'
                }
              },
              additionalTrainingSourceEnabled: true
            },
            preTranslate: true
          }
        });
        env.wait();
        env.wait();
        expect(env.additionalTrainingSourceSelect).not.toBeNull();
        expect(env.additionalTrainingSourceSelectValue).toContain('ParatextP1');
        expect(env.statusDone(env.additionalTrainingSourceStatus)).toBeNull();

        env.resetAdditionalTrainingSourceProject();

        expect(env.additionalTrainingSourceSelectValue).toBe('');
        expect(env.statusDone(env.additionalTrainingSourceStatus)).not.toBeNull();
      }));
    });

    describe('Additional Training Data', () => {
      it('should update when the additional training data checkbox is ticked', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        expect(env.statusDone(env.additionalTrainingDataStatus)).toBeNull();
        expect(env.inputElement(env.additionalTrainingDataCheckbox).checked).toBe(false);
        env.clickElement(env.inputElement(env.additionalTrainingDataCheckbox));
        expect(env.inputElement(env.additionalTrainingDataCheckbox).checked).toBe(true);
        env.wait();

        expect(env.statusDone(env.additionalTrainingDataStatus)).not.toBeNull();
      }));

      it('should update when the additional training data checkbox is unticked', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            draftConfig: {
              additionalTrainingData: true
            },
            preTranslate: true
          }
        });
        env.wait();
        expect(env.statusDone(env.additionalTrainingDataStatus)).toBeNull();
        expect(env.inputElement(env.additionalTrainingDataCheckbox).checked).toBe(true);
        env.clickElement(env.inputElement(env.additionalTrainingDataCheckbox));
        expect(env.inputElement(env.additionalTrainingDataCheckbox).checked).toBe(false);
        env.wait();

        expect(env.statusDone(env.additionalTrainingDataStatus)).not.toBeNull();
      }));
    });

    describe('Serval Config TextArea', () => {
      it('should not display for non-serval administrators', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        env.wait();
        expect(env.servalConfigTextArea).toBeNull();
      }));

      it('should display for serval administrators on back translations', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            preTranslate: false,
            projectType: ProjectType.BackTranslation
          }
        });
        when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
        env.wait();
        env.wait();
        expect(env.servalConfigTextArea).not.toBeNull();
      }));

      it('should display for serval administrators on forward translations', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
        env.wait();
        env.wait();
        expect(env.servalConfigTextArea).not.toBeNull();
      }));

      it('should not display for serval administrators when the feature flag is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        when(mockedFeatureFlagService.showNmtDrafting).thenReturn(createTestFeatureFlag(false));
        when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
        env.wait();
        env.wait();
        expect(env.servalConfigTextArea).toBeNull();
      }));

      it('should display for serval administrators on forward translations when not approved', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
        env.wait();
        env.wait();
        expect(env.servalConfigTextArea).not.toBeNull();
      }));

      it('should change serval config value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
        env.wait();
        env.wait();
        expect(env.servalConfigTextArea).not.toBeNull();
        expect(env.servalConfigTextAreaElement.value).toBe('');
        expect(env.statusDone(env.servalConfigStatus)).toBeNull();

        env.setServalConfigValue('{}');

        expect(env.servalConfigTextAreaElement.value).toContain('{}');

        // Trigger the onblur, which will save the value
        env.servalConfigTextAreaElement.dispatchEvent(new InputEvent('blur'));
        env.wait();

        verify(mockedSFProjectService.onlineSetServalConfig('project01', anything())).once();
        expect(env.statusDone(env.servalConfigStatus)).not.toBeNull();
      }));

      it('should clear the serval config value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            draftConfig: {
              servalConfig: '{}'
            },
            preTranslate: true
          }
        });
        when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
        env.wait();
        env.wait();
        expect(env.servalConfigTextArea).not.toBeNull();
        expect(env.servalConfigTextAreaElement.value).toBe('{}');
        expect(env.statusDone(env.servalConfigStatus)).toBeNull();

        env.setServalConfigValue('');

        expect(env.servalConfigTextAreaElement.value).toBe('');

        // Trigger the onblur, which will save the value
        env.servalConfigTextAreaElement.dispatchEvent(new InputEvent('blur'));
        env.wait();

        verify(mockedSFProjectService.onlineSetServalConfig('project01', anything())).once();
        expect(env.statusDone(env.servalConfigStatus)).not.toBeNull();
      }));

      it('should not update an unchanged serval config value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
        env.wait();
        env.wait();
        expect(env.servalConfigTextArea).not.toBeNull();
        expect(env.servalConfigTextAreaElement.value).toBe('');
        expect(env.statusDone(env.servalConfigStatus)).toBeNull();

        env.setServalConfigValue('');

        expect(env.servalConfigTextAreaElement.value).toBe('');

        // Trigger the onblur, which will trigger the save
        env.servalConfigTextAreaElement.dispatchEvent(new InputEvent('blur'));
        env.wait();

        verify(mockedSFProjectService.onlineSetServalConfig('project01', anything())).never();
        expect(env.statusDone(env.servalConfigStatus)).toBeNull();
      }));
    });

    describe('Translation Suggestions options', () => {
      it('should see login button when Paratext account not connected', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        when(mockedParatextService.getParatextUsername()).thenReturn(of(undefined));
        env.wait();
        expect(env.loginButton).not.toBeNull();
        expect(env.inputElement(env.translationSuggestionsCheckbox).disabled).toBe(false);
        expect(env.basedOnSelect).not.toBeNull();
      }));

      it('should display the Paratext credentials update prompt when get projects and resources throws a forbidden error', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        when(mockedParatextService.getProjects()).thenReject(new HttpErrorResponse({ status: 401 }));
        when(mockedParatextService.getResources()).thenReject(new HttpErrorResponse({ status: 401 }));
        env.wait();

        verify(mockedParatextService.getProjects()).once();
        verify(mockedParatextService.getResources()).once();
        verify(mockedAuthService.requestParatextCredentialUpdate()).once();
        expect(env.inputElement(env.basedOnSelect).disabled).toBe(true);
      }));

      it('should hide Translation Suggestions when Based On is not set', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelectValue).toContain('ParatextP1');

        env.resetBasedOnProject();

        expect(env.translationSuggestionsCheckbox).toBeNull();
        expect(env.basedOnSelectValue).toEqual('');
      }));

      it('should show Translation Suggestions when Based On is set', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject(
          {
            translateConfig: {
              translationSuggestionsEnabled: false,
              source: undefined
            }
          },
          true
        );
        env.wait();
        expect(env.translationSuggestionsCheckbox).toBeNull();
        expect(env.basedOnSelectValue).toEqual('');

        env.setBasedOnValue('paratextId01');

        expect(env.inputElement(env.translationSuggestionsCheckbox)).not.toBeNull();
        expect(env.basedOnSelectValue).toEqual('ParatextP1');
      }));

      it('should retain Based On value when Translation Suggestions is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        env.clickElement(env.inputElement(env.checkingCheckbox));
        expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelectValue).toContain('ParatextP1');

        env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));

        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(false);
        expect(env.statusDone(env.translationSuggestionsStatus)).not.toBeNull();

        env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));

        env.wait();
        expect(env.statusDone(env.translationSuggestionsStatus)).not.toBeNull();
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelectValue).toContain('ParatextP1');
      }));

      it('should change Based On select value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelectValue).toContain('ParatextP1');
        expect(env.statusDone(env.basedOnStatus)).toBeNull();

        env.setBasedOnValue('paratextId02');

        expect(env.basedOnSelectValue).toContain('ParatextP2');
        expect(env.statusDone(env.basedOnStatus)).not.toBeNull();
      }));

      it('should display Based On project even if user is not a member', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        when(mockedParatextService.getProjects()).thenResolve([
          {
            paratextId: 'paratextId02',
            name: 'ParatextP2',
            shortName: 'PT2',
            languageTag: 'qaa',
            isConnectable: true,
            isConnected: false
          }
        ]);
        when(mockedParatextService.getResources()).thenResolve([]);

        env.wait();
        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelectValue).toBe('ParatextP1');
        expect(env.basedOnSelectProjectsResources.length).toEqual(1);
        expect(env.basedOnSelectProjectsResources[0].name).toBe('ParatextP2');
      }));

      it('should display projects then resources', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelectProjectsResources.length).toEqual(5);
        expect(env.basedOnSelectProjectsResources[1].name).toBe('ParatextP2');
        expect(env.basedOnSelectProjectsResources[2].name).toBe('Sob Jonah and Luke');
      }));

      it('Translation Suggestions should remain unchanged when Based On is changed', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject(
          {
            translateConfig: {
              translationSuggestionsEnabled: false
            }
          },
          true
        );
        env.wait();
        expect(env.translationSuggestionsCheckbox).toBeNull();
        expect(env.basedOnSelectValue).toEqual('');

        env.setBasedOnValue('paratextId01');
        expect(env.translationSuggestionsCheckbox).not.toBeNull();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(false);
        expect(env.basedOnSelectValue).toContain('ParatextP1');

        env.setBasedOnValue('paratextId02');
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(false);
        expect(env.basedOnSelectValue).toContain('ParatextP2');
        expect(env.statusDone(env.translationSuggestionsStatus)).toBeNull();
        expect(env.statusDone(env.basedOnStatus)).not.toBeNull();

        env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);

        env.setBasedOnValue('paratextId01');
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        const [_, secondArg] = capture(mockedSFProjectService.onlineUpdateSettings).last();
        expect(secondArg).toEqual({ sourceParatextId: 'paratextId01', translationSuggestionsEnabled: true });
      }));

      it('should save Translation Suggestions only if Based On is set', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translateConfig: {
            translationSuggestionsEnabled: false,
            source: {
              paratextId: 'paratextId01',
              projectRef: 'paratext01',
              name: 'ParatextP1',
              shortName: 'PT1',
              writingSystem: {
                tag: 'qaa'
              }
            }
          }
        });
        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(false);

        env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.statusDone(env.translationSuggestionsStatus)).not.toBeNull();
        expect(env.statusDone(env.basedOnStatus)).toBeNull();
      }));
    });

    describe('Checking options', () => {
      it('should hide options when Checking is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.makeProjectHaveTextAudio();
        env.setupProject();
        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.inputElement(env.checkingCheckbox).checked).toBe(false);
        expect(env.seeOthersResponsesCheckbox).toBeNull();
        expect(env.communityCheckersShareCheckbox).toBeNull();
        expect(env.checkingHideCommunityCheckingTextCheckbox).toBeNull();
        env.clickElement(env.inputElement(env.checkingCheckbox));
        expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);
        expect(env.seeOthersResponsesCheckbox).not.toBeNull();
        expect(env.communityCheckersShareCheckbox).not.toBeNull();
        expect(env.checkingHideCommunityCheckingTextCheckbox).not.toBeNull();
      }));

      it('changing state of checking option results in status icon', fakeAsync(() => {
        const env = new TestEnvironment();
        env.makeProjectHaveTextAudio();
        env.setupProject();
        env.wait();
        env.clickElement(env.inputElement(env.checkingCheckbox));
        expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);

        expect(env.statusDone(env.seeOthersResponsesStatus)).toBeNull();
        env.clickElement(env.inputElement(env.seeOthersResponsesCheckbox));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.seeOthersResponsesStatus)).not.toBeNull();

        expect(env.statusDone(env.communityCheckersShareStatus)).toBeNull();
        env.clickElement(env.inputElement(env.communityCheckersShareCheckbox));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.communityCheckersShareStatus)).not.toBeNull();

        expect(env.statusDone(env.checkingExportStatus)).toBeNull();
        env.clickElement(env.inputElement(env.checkingExportAll));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.checkingExportStatus)).not.toBeNull();

        expect(env.statusDone(env.checkingHideCommunityCheckingTextStatus)).toBeNull();
        env.clickElement(env.inputElement(env.checkingHideCommunityCheckingTextCheckbox));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.checkingHideCommunityCheckingTextStatus)).not.toBeNull();
      }));

      it('has hide-text option', fakeAsync(async () => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        env.clickElement(env.inputElement(env.checkingCheckbox));
        expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);

        // SUT
        expect(env.checkingHideCommunityCheckingTextCheckbox).withContext('checkbox should be shown').not.toBeNull();
      }));
    });

    describe('Biblical Terms options', () => {
      it('Biblical Terms should be disabled if a message is present', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({ biblicalTermsConfig: { biblicalTermsEnabled: false, errorMessage: 'A message' } });
        env.wait();
        expect(env.inputElement(env.biblicalTermsCheckbox).checked).toBe(false);
        expect(env.inputElement(env.biblicalTermsCheckbox).disabled).toBe(true);
      }));
    });
  });

  describe('Sharing Settings', () => {
    it('updateSharingSetting merges role permissions', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({
        rolePermissions: {
          [SFProjectRole.Viewer]: [SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Create)]
        }
      });
      env.wait();

      expect(env.statusDone(env.viewersShareStatus)).toBeNull();
      expect(env.inputElement(env.viewersShareCheckbox).checked).toBeFalse();
      env.clickElement(env.inputElement(env.viewersShareCheckbox));
      tick();
      env.fixture.detectChanges();
      expect(env.statusDone(env.viewersShareStatus)).not.toBeNull();
      verify(
        mockedSFProjectService.onlineSetRoleProjectPermissions(
          'project01',
          SFProjectRole.Viewer,
          deepEqual([
            SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Create),
            SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)
          ])
        )
      ).once();
    }));

    describe('translators checkbox', () => {
      it('retrieves its value from the role permissions', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          rolePermissions: {
            [SFProjectRole.ParatextTranslator]: [
              SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)
            ]
          }
        });
        env.wait();

        expect(env.statusDone(env.translatorsShareStatus)).toBeNull();
        expect(env.inputElement(env.translatorsShareCheckbox).checked).toBeTrue();
        env.clickElement(env.inputElement(env.translatorsShareCheckbox));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.translatorsShareStatus)).not.toBeNull();
        verify(
          mockedSFProjectService.onlineSetRoleProjectPermissions(
            'project01',
            SFProjectRole.ParatextTranslator,
            deepEqual([])
          )
        ).once();
      }));

      it('sets role permissions', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();

        expect(env.statusDone(env.translatorsShareStatus)).toBeNull();
        expect(env.inputElement(env.translatorsShareCheckbox).checked).toBeFalse();
        env.clickElement(env.inputElement(env.translatorsShareCheckbox));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.translatorsShareStatus)).not.toBeNull();
        verify(
          mockedSFProjectService.onlineSetRoleProjectPermissions(
            'project01',
            SFProjectRole.ParatextTranslator,
            deepEqual([SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)])
          )
        ).once();
      }));
    });

    describe('community checkers checkbox', () => {
      it('does not display if checking is not enabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({ checkingConfig: { checkingEnabled: false } });
        env.wait();

        expect(env.communityCheckersShareStatus).toBeNull();
        expect(env.communityCheckersShareCheckbox).toBeNull();
      }));

      it('retrieves its value from the role permissions', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          checkingConfig: { checkingEnabled: true },
          rolePermissions: {
            [SFProjectRole.CommunityChecker]: [
              SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)
            ]
          }
        });
        env.wait();

        expect(env.statusDone(env.communityCheckersShareStatus)).toBeNull();
        expect(env.inputElement(env.communityCheckersShareCheckbox).checked).toBeTrue();
        env.clickElement(env.inputElement(env.communityCheckersShareCheckbox));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.communityCheckersShareStatus)).not.toBeNull();
        verify(
          mockedSFProjectService.onlineSetRoleProjectPermissions(
            'project01',
            SFProjectRole.CommunityChecker,
            deepEqual([])
          )
        ).once();
      }));

      it('sets role permissions', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({ checkingConfig: { checkingEnabled: true } });
        env.wait();

        expect(env.statusDone(env.communityCheckersShareStatus)).toBeNull();
        expect(env.inputElement(env.communityCheckersShareCheckbox).checked).toBeFalse();
        env.clickElement(env.inputElement(env.communityCheckersShareCheckbox));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.communityCheckersShareStatus)).not.toBeNull();
        verify(
          mockedSFProjectService.onlineSetRoleProjectPermissions(
            'project01',
            SFProjectRole.CommunityChecker,
            deepEqual([SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)])
          )
        ).once();
      }));
    });

    describe('commenters checkbox', () => {
      it('retrieves its value from the role permissions', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          rolePermissions: {
            [SFProjectRole.Commenter]: [SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)]
          }
        });
        env.wait();

        expect(env.statusDone(env.commentersShareStatus)).toBeNull();
        expect(env.inputElement(env.commentersShareCheckbox).checked).toBeTrue();
        env.clickElement(env.inputElement(env.commentersShareCheckbox));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.commentersShareStatus)).not.toBeNull();
        verify(
          mockedSFProjectService.onlineSetRoleProjectPermissions('project01', SFProjectRole.Commenter, deepEqual([]))
        ).once();
      }));

      it('sets role permissions', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();

        expect(env.statusDone(env.commentersShareStatus)).toBeNull();
        expect(env.inputElement(env.commentersShareCheckbox).checked).toBeFalse();
        env.clickElement(env.inputElement(env.commentersShareCheckbox));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.commentersShareStatus)).not.toBeNull();
        verify(
          mockedSFProjectService.onlineSetRoleProjectPermissions(
            'project01',
            SFProjectRole.Commenter,
            deepEqual([SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)])
          )
        ).once();
      }));
    });

    describe('viewers checkbox', () => {
      it('retrieves its value from the role permissions', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          rolePermissions: {
            [SFProjectRole.Viewer]: [SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)]
          }
        });
        env.wait();

        expect(env.statusDone(env.viewersShareStatus)).toBeNull();
        expect(env.inputElement(env.viewersShareCheckbox).checked).toBeTrue();
        env.clickElement(env.inputElement(env.viewersShareCheckbox));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.viewersShareStatus)).not.toBeNull();
        verify(
          mockedSFProjectService.onlineSetRoleProjectPermissions('project01', SFProjectRole.Viewer, deepEqual([]))
        ).once();
      }));
    });

    it('sets role permissions', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.wait();

      expect(env.statusDone(env.viewersShareStatus)).toBeNull();
      expect(env.inputElement(env.viewersShareCheckbox).checked).toBeFalse();
      env.clickElement(env.inputElement(env.viewersShareCheckbox));
      tick();
      env.fixture.detectChanges();
      expect(env.statusDone(env.viewersShareStatus)).not.toBeNull();
      verify(
        mockedSFProjectService.onlineSetRoleProjectPermissions(
          'project01',
          SFProjectRole.Viewer,
          deepEqual([SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)])
        )
      ).once();
    }));
  });

  describe('Danger Zone', () => {
    it('should display Danger Zone', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.fixture.detectChanges();
      expect(env.dangerZoneTitle.textContent).toContain('Danger Zone');
      expect(env.deleteProjectButton.textContent).toContain('Delete this project');
    }));

    it('should disable Delete button while loading', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.fixture.detectChanges();
      expect(env.deleteProjectButton).not.toBeNull();
      expect(env.deleteProjectButton.disabled).toBe(true);

      env.wait();
      expect(env.deleteProjectButton.disabled).toBe(false);
    }));

    it('should hide/disabled settings while loading', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.fixture.detectChanges();
      expect(env.translationSuggestionsCheckbox).toBeNull();
      expect(env.basedOnSelect).toBeNull();
      expect(env.checkingCheckbox).not.toBeNull();
      expect(env.inputElement(env.checkingCheckbox).disabled).toBe(true);

      env.wait();
      expect(env.translationSuggestionsCheckbox).not.toBeNull();
      expect(env.basedOnSelect).not.toBeNull();
      expect(env.inputElement(env.translationSuggestionsCheckbox).disabled).toBe(false);
      expect(env.inputElement(env.checkingCheckbox).disabled).toBe(false);
    }));

    it('should disable Delete button if project is a source project', fakeAsync(() => {
      const env = new TestEnvironment(true, true);
      env.setupProject();
      env.wait();
      env.fixture.detectChanges();
      expect(env.deleteProjectButton).not.toBeNull();
      expect(env.deleteProjectButton.disabled).toBe(true);
      expect(env.sourceProjectMessage).not.toBeNull();
    }));

    it('should disable Delete button if project is syncing', fakeAsync(() => {
      const env = new TestEnvironment(true);
      env.setupProject({ sync: { queuedCount: 1 } });
      env.wait();
      env.fixture.detectChanges();
      expect(env.deleteProjectButton).not.toBeNull();
      expect(env.deleteProjectButton.disabled).toBe(true);
      expect(env.projectSyncingMessage).not.toBeNull();
    }));

    it('should delete project if user confirms on the dialog', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.setDialogResponse(true);
      env.wait();
      env.clickElement(env.deleteProjectButton);
      verify(mockedUserService.setCurrentProjectId(anything(), undefined)).once();
      verify(mockedSFProjectService.onlineDelete(anything())).once();
      expect(env.location.path()).toEqual('/projects');
    }));

    it('should not delete project if user cancels', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.setDialogResponse(false);
      env.wait();
      env.clickElement(env.deleteProjectButton);
      verify(mockedUserService.setCurrentProjectId(anything(), undefined)).never();
      verify(mockedSFProjectService.onlineDelete(anything())).never();
      expect().nothing();
    }));
  });
});

class TestEnvironment {
  readonly component: SettingsComponent;
  readonly fixture: ComponentFixture<SettingsComponent>;
  readonly location: Location;
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;
  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private mockedDialogRef = mock<MatDialogRef<DeleteProjectDialogComponent>>(MatDialogRef);

  constructor(hasConnection: boolean = true, isSource: boolean = false) {
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(mockedAuthService.currentUserRoles).thenReturn([]);
    when(mockedSFProjectService.onlineIsSourceProject('project01')).thenResolve(isSource);
    when(mockedSFProjectService.onlineDelete(anything())).thenResolve();
    when(mockedSFProjectService.onlineUpdateSettings('project01', anything())).thenResolve();
    when(mockedSFProjectService.onlineSetServalConfig('project01', anything())).thenResolve();
    when(mockedSFProjectService.onlineSetRoleProjectPermissions('project01', anything(), anything())).thenResolve();
    when(mockedSFProjectService.get('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );
    this.testOnlineStatusService.setIsOnline(hasConnection);

    when(mockedParatextService.getParatextUsername()).thenReturn(of('Paratext 01'));
    when(mockedParatextService.getProjects()).thenResolve([
      {
        paratextId: 'paratextId01',
        name: 'ParatextP1',
        shortName: 'PT1',
        languageTag: 'qaa',
        isConnectable: true,
        isConnected: false
      },
      {
        paratextId: 'paratextId02',
        name: 'ParatextP2',
        shortName: 'PT2',
        languageTag: 'qaa',
        isConnectable: true,
        isConnected: false
      }
    ]);
    when(mockedParatextService.getResources()).thenResolve([
      { paratextId: 'e01f11e9b4b8e338', name: 'Sob Jonah and Luke', shortName: 'SJL' },
      {
        paratextId: '5e51f89e89947acb',
        name: 'Aruamu New Testament [msy] Papua New Guinea 2004 DBL',
        shortName: 'ANT'
      },
      { paratextId: '9bb76cd3e5a7f9b4', name: 'Revised Version with Apocrypha 1885, 1895', shortName: 'RVA' }
    ]);
    when(mockedFeatureFlagService.showNmtDrafting).thenReturn(createTestFeatureFlag(true));
    when(mockedFeatureFlagService.allowAdditionalTrainingSource).thenReturn(createTestFeatureFlag(true));

    when(mockedSFProjectService.queryAudioText(anything(), anything())).thenCall(sfProjectId => {
      const queryParams: QueryParameters = {
        [obj<TextAudio>().pathStr(t => t.projectRef)]: sfProjectId
      };
      return this.realtimeService.subscribeQuery(TextAudioDoc.COLLECTION, queryParams, noopDestroyRef);
    });

    this.fixture = TestBed.createComponent(SettingsComponent);
    this.component = this.fixture.componentInstance;
    this.location = TestBed.inject(Location);
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get translationSuggestionsCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-translation-suggestions'));
  }

  get alternateSourceSelect(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-project-select#alternateSourceParatextId'));
  }

  get alternateSourceStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#alternate-source-status'));
  }

  get alternateTrainingSourceSelect(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-project-select#alternateTrainingSourceParatextId'));
  }

  get alternateTrainingSourceStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#alternate-training-source-status'));
  }

  get additionalTrainingSourceSelect(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-project-select#additionalTrainingSourceParatextId'));
  }

  get additionalTrainingSourceStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#additional-training-source-status'));
  }

  get servalConfigTextArea(): DebugElement {
    return this.fixture.debugElement.query(By.css('#serval-config'));
  }

  get servalConfigStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#serval-config-status'));
  }

  get translationSuggestionsStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#translation-suggestions-status'));
  }

  get basedOnSelect(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-project-select#sourceParatextId'));
  }

  get basedOnStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#based-on-status'));
  }

  get loginButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#btn-log-in-settings'));
  }

  get checkingCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-community-checking'));
  }

  get checkingStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checking-status'));
  }

  get seeOthersResponsesCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-see-others-responses'));
  }

  get seeOthersResponsesStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#see-others-responses-status'));
  }

  get checkingExportAll(): DebugElement {
    return this.fixture.debugElement.query(By.css('#radio-checkingExport-all'));
  }

  get checkingExportStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkingExport-status'));
  }

  get checkingHideCommunityCheckingTextCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-hide-community-checking-text'));
  }

  get checkingHideCommunityCheckingTextStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#hide-community-checking-text-status'));
  }

  get dangerZoneTitle(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#danger-zone div');
  }

  get projectSyncingMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#danger-zone .project-syncing-msg');
  }

  get sourceProjectMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#danger-zone .source-project-msg');
  }

  get deleteProjectButton(): HTMLButtonElement {
    return this.fixture.nativeElement.querySelector('#delete-btn');
  }

  get confirmDeleteBtn(): HTMLElement {
    return this.overlayContainerElement.querySelector('#project-delete-btn') as HTMLElement;
  }

  get cancelDeleteBtn(): HTMLElement {
    return this.overlayContainerElement.querySelector('#cancel-btn') as HTMLElement;
  }

  get offlineMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.offline-text');
  }

  get basedOnSelectErrorMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.tool-setting-field + mat-error');
  }

  get biblicalTermsCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-biblical-terms'));
  }

  set onlineStatus(hasConnection: boolean) {
    this.testOnlineStatusService.setIsOnline(hasConnection);
    tick();
    this.fixture.detectChanges();
  }

  get alternateSourceCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-alternate-source-enabled'));
  }

  get alternateSourceSelectValue(): string {
    return this.alternateSourceSelectComponent.paratextIdControl.value?.name || '';
  }

  get alternateSourceSelectComponent(): ProjectSelectComponent {
    return this.alternateSourceSelect.componentInstance as ProjectSelectComponent;
  }

  get alternateSourceSelectProjectsResources(): SelectableProject[] {
    return (this.alternateSourceSelectComponent.projects || []).concat(
      this.alternateSourceSelectComponent.resources || []
    );
  }

  get additionalTrainingSourceCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-additional-training-source-enabled'));
  }

  get additionalTrainingSourceSelectValue(): string {
    return this.additionalTrainingSourceSelectComponent.paratextIdControl.value?.name || '';
  }

  get additionalTrainingSourceSelectComponent(): ProjectSelectComponent {
    return this.additionalTrainingSourceSelect.componentInstance as ProjectSelectComponent;
  }

  get additionalTrainingSourceSelectProjectsResources(): SelectableProject[] {
    return (this.additionalTrainingSourceSelectComponent.projects || []).concat(
      this.additionalTrainingSourceSelectComponent.resources || []
    );
  }

  get servalConfigTextAreaElement(): HTMLTextAreaElement {
    return this.servalConfigTextArea?.nativeElement as HTMLTextAreaElement;
  }

  get basedOnSelectValue(): string {
    return this.basedOnSelectComponent.paratextIdControl.value?.name || '';
  }

  get basedOnSelectComponent(): ProjectSelectComponent {
    return this.basedOnSelect.componentInstance as ProjectSelectComponent;
  }

  get basedOnSelectProjectsResources(): SelectableProject[] {
    return (this.basedOnSelectComponent.projects || []).concat(this.basedOnSelectComponent.resources || []);
  }

  get alternateTrainingSourceCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-alternate-training-source-enabled'));
  }

  get alternateTrainingSourceSelectValue(): string {
    return this.alternateTrainingSourceSelectComponent.paratextIdControl.value?.name || '';
  }

  get alternateTrainingSourceSelectComponent(): ProjectSelectComponent {
    return this.alternateTrainingSourceSelect.componentInstance as ProjectSelectComponent;
  }

  get alternateTrainingSourceSelectProjectsResources(): SelectableProject[] {
    return (this.alternateTrainingSourceSelectComponent.projects || []).concat(
      this.alternateTrainingSourceSelectComponent.resources || []
    );
  }

  get additionalTrainingDataCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-pre-translation-additional-training-data'));
  }

  get additionalTrainingDataStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#pre-translation-additional-training-data-status'));
  }

  get translatorsShareCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-translators-share'));
  }

  get translatorsShareStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#translators-share-status'));
  }

  get communityCheckersShareCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-community-checkers-share'));
  }

  get communityCheckersShareStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#community-checkers-share-status'));
  }

  get commentersShareCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-commenters-share'));
  }

  get commentersShareStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#commenters-share-status'));
  }

  get viewersShareCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-viewers-share'));
  }

  get viewersShareStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#viewers-share-status'));
  }

  makeProjectHaveTextAudio(): void {
    this.realtimeService.addSnapshot<TextAudio>(TextAudioDoc.COLLECTION, {
      id: 'sAudio1',
      data: createTestTextAudio({ projectRef: 'project01' })
    });
  }

  setDialogResponse(confirm: boolean): void {
    when(this.mockedDialogRef.afterClosed()).thenReturn(of(confirm ? 'accept' : 'cancel'));
    when(mockedDialog.open(DeleteProjectDialogComponent, anything())).thenReturn(instance(this.mockedDialogRef));
  }

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = (element as DebugElement).nativeElement as HTMLElement;
    }
    element.click();
    this.fixture.detectChanges();
    tick(1000);
  }

  inputElement(element: DebugElement): HTMLInputElement {
    return element.nativeElement.querySelector('input') as HTMLInputElement;
  }

  resetBasedOnProject(): void {
    this.basedOnSelectComponent.paratextIdControl.setValue('');
    this.wait();
  }

  resetAlternateSourceProject(): void {
    this.alternateSourceSelectComponent.paratextIdControl.setValue('');
    this.wait();
  }

  resetAlternateTrainingSourceProject(): void {
    this.alternateTrainingSourceSelectComponent.paratextIdControl.setValue('');
    this.wait();
  }

  resetAdditionalTrainingSourceProject(): void {
    this.additionalTrainingSourceSelectComponent.paratextIdControl.setValue('');
    this.wait();
  }

  statusNone(element: DebugElement): boolean {
    return element.children.length === 0;
  }

  statusDone(element: DebugElement): HTMLElement {
    return element.nativeElement.querySelector('.check-icon') as HTMLElement;
  }

  statusError(element: DebugElement): HTMLElement {
    return element.nativeElement.querySelector('.error-icon') as HTMLElement;
  }

  setAlternateSourceValue(value: string): void {
    this.alternateSourceSelectComponent.value = value;
    this.wait();
  }

  setAdditionalTrainingSourceValue(value: string): void {
    this.additionalTrainingSourceSelectComponent.value = value;
    this.wait();
  }

  setServalConfigValue(value: string): void {
    this.servalConfigTextAreaElement.value = value;
    this.servalConfigTextAreaElement.dispatchEvent(new Event('input'));
    this.wait();
  }

  setBasedOnValue(value: string): void {
    this.basedOnSelectComponent.value = value;
    this.wait();
  }

  setAlternateTrainingSourceValue(value: string): void {
    this.alternateTrainingSourceSelectComponent.value = value;
    this.wait();
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
    tick();
  }

  testProject: SFProject = createTestProject({
    translateConfig: {
      preTranslate: true,
      translationSuggestionsEnabled: true,
      source: {
        paratextId: 'paratextId01',
        projectRef: 'paratext01',
        name: 'ParatextP1',
        shortName: 'PT1',
        writingSystem: {
          tag: 'qaa'
        }
      }
    },
    checkingConfig: {
      checkingEnabled: false,
      usersSeeEachOthersResponses: false
    }
  });

  setupProject(data: RecursivePartial<SFProject> = {}, noSource = false): void {
    const projectData = cloneDeep(this.testProject);
    if (data.translateConfig != null) {
      projectData.translateConfig = merge(projectData.translateConfig, data.translateConfig);
      if (noSource) {
        projectData.translateConfig.source = undefined;
      }
    }
    if (data.checkingConfig != null) {
      projectData.checkingConfig = merge(projectData.checkingConfig, data.checkingConfig);
    }
    if (data.biblicalTermsConfig != null) {
      projectData.biblicalTermsConfig = merge(projectData.biblicalTermsConfig, data.biblicalTermsConfig);
    }
    if (data.sync != null) {
      projectData.sync = merge(projectData.sync, data.sync);
    }
    if (data.rolePermissions != null) {
      const rolePermissions: { [key: string]: string[] } = {};
      for (const [role, permissions] of Object.entries(data.rolePermissions)) {
        rolePermissions[role] = permissions?.filter(p => p != null) ?? [];
      }
      projectData.rolePermissions = rolePermissions;
    }
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'project01',
      data: projectData
    });
  }
}
