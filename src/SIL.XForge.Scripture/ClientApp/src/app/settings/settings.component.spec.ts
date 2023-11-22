import { Location } from '@angular/common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatLegacyDialog as MatDialog, MatLegacyDialogRef as MatDialogRef } from '@angular/material/legacy-dialog';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Route } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { CookieService } from 'ngx-cookie-service';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { CheckingConfig } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { createTestTextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio-test-data';
import { TextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import { TranslateConfig } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { of } from 'rxjs';
import { anything, capture, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { FeatureFlagService, ObservableFeatureFlag } from 'xforge-common/feature-flags/feature-flag.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { WriteStatusComponent } from 'xforge-common/write-status/write-status.component';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
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
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
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
      HttpClientTestingModule,
      RouterTestingModule.withRoutes(ROUTES),
      UICommonModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      TestOnlineStatusModule.forRoot(),
      NoopAnimationsModule
    ],
    declarations: [SettingsComponent, WriteStatusComponent, MockComponent, ProjectSelectComponent, InfoComponent],
    providers: [
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: CookieService, useMock: mockedCookieService },
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
        env.setupProject();
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
            lastSelectedBooks: [],
            trainOnEnabled: false
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
        env.setupProject();
        env.wait();
        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.alternateSourceSelect).not.toBeNull();
        expect(env.alternateSourceSelectProjectsResources.length).toEqual(5);
        expect(env.alternateSourceSelectProjectsResources[1].name).toBe('ParatextP2');
        expect(env.alternateSourceSelectProjectsResources[2].name).toBe('Sob Jonah and Luke');
      }));
    });

    describe('Train On', () => {
      it('should change train on source select value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({ draftConfig: { trainOnEnabled: true, lastSelectedBooks: [] } });
        env.wait();
        env.wait();
        expect(env.trainOnSourceSelect).not.toBeNull();
        expect(env.trainOnSourceSelectValue).toBe('');
        expect(env.statusDone(env.trainOnSourceStatus)).toBeNull();

        env.setTrainOnSourceValue('paratextId02');

        expect(env.trainOnSourceSelectValue).toContain('ParatextP2');
        expect(env.statusDone(env.trainOnSourceStatus)).not.toBeNull();
      }));

      it('should unset train on source select value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          draftConfig: {
            trainOnSource: {
              paratextId: 'paratextId01',
              projectRef: 'paratext01',
              name: 'ParatextP1',
              shortName: 'PT1',
              writingSystem: {
                tag: 'qaa'
              }
            },
            lastSelectedBooks: [],
            trainOnEnabled: true
          }
        });
        env.wait();
        env.wait();
        expect(env.trainOnSourceSelect).not.toBeNull();
        expect(env.trainOnSourceSelectValue).toContain('ParatextP1');
        expect(env.statusDone(env.trainOnSourceStatus)).toBeNull();

        env.resetTrainOnSourceProject();

        expect(env.trainOnSourceSelectValue).toBe('');
        expect(env.statusDone(env.trainOnSourceStatus)).not.toBeNull();
      }));

      it('should hide train on source dropdown when train on is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        expect(env.inputElement(env.trainOnCheckbox).checked).toBe(false);
        expect(env.trainOnSourceSelect).toBeNull();
        env.clickElement(env.inputElement(env.trainOnCheckbox));
        expect(env.inputElement(env.trainOnCheckbox).checked).toBe(true);
        expect(env.trainOnSourceSelect).not.toBeNull();
      }));

      it('should display projects then resources', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({ draftConfig: { trainOnEnabled: true, lastSelectedBooks: [] } });
        env.wait();
        env.wait();
        expect(env.inputElement(env.trainOnCheckbox).checked).toBe(true);
        expect(env.trainOnSourceSelect).not.toBeNull();
        expect(env.trainOnSourceSelectProjectsResources.length).toEqual(5);
        expect(env.trainOnSourceSelectProjectsResources[1].name).toBe('ParatextP2');
        expect(env.trainOnSourceSelectProjectsResources[2].name).toBe('Sob Jonah and Luke');
      }));

      it('should display train on source project even if user is not a member', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          draftConfig: {
            trainOnSource: {
              paratextId: 'paratextId01',
              projectRef: 'paratext01',
              name: 'ParatextP1',
              shortName: 'PT1',
              writingSystem: {
                tag: 'qaa'
              }
            },
            lastSelectedBooks: [],
            trainOnEnabled: true
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
        expect(env.trainOnSourceSelect).not.toBeNull();
        expect(env.trainOnSourceSelectValue).toBe('ParatextP1');
        expect(env.trainOnSourceSelectProjectsResources.length).toEqual(1);
        expect(env.trainOnSourceSelectProjectsResources[0].name).toBe('ParatextP2');
      }));
    });

    describe('Translation Suggestions options', () => {
      it('should see login button when Paratext account not connected', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        when(mockedParatextService.getProjects()).thenResolve(undefined);
        when(mockedParatextService.getResources()).thenResolve(undefined);
        env.wait();
        expect(env.loginButton).not.toBeNull();
        expect(env.inputElement(env.translationSuggestionsCheckbox).disabled).toBe(false);
        expect(env.basedOnSelect).not.toBeNull();
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
        env.setupProject({
          translationSuggestionsEnabled: false,
          shareEnabled: false
        });
        tick();
        env.fixture.detectChanges();
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
        env.setupProject({
          translationSuggestionsEnabled: false,
          shareEnabled: false
        });
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
          translationSuggestionsEnabled: false,
          shareEnabled: false,
          source: {
            paratextId: 'paratextId01',
            projectRef: 'paratext01',
            name: 'ParatextP1',
            shortName: 'PT1',
            writingSystem: {
              tag: 'qaa'
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
        expect(env.checkingShareCheckbox).toBeNull();
        expect(env.checkingHideCommunityCheckingTextCheckbox).toBeNull();
        env.clickElement(env.inputElement(env.checkingCheckbox));
        expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);
        expect(env.seeOthersResponsesCheckbox).not.toBeNull();
        expect(env.checkingShareCheckbox).not.toBeNull();
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

        expect(env.statusDone(env.checkingShareStatus)).toBeNull();
        env.clickElement(env.inputElement(env.checkingShareCheckbox));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.checkingShareStatus)).not.toBeNull();

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
        env.setupProject(undefined, undefined, false, 'A message');
        env.wait();
        expect(env.inputElement(env.biblicalTermsCheckbox).checked).toBe(false);
        expect(env.inputElement(env.biblicalTermsCheckbox).disabled).toBe(true);
      }));
    });
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
    when(mockedSFProjectService.onlineIsSourceProject('project01')).thenResolve(isSource);
    when(mockedSFProjectService.onlineDelete(anything())).thenResolve();
    when(mockedSFProjectService.onlineUpdateSettings('project01', anything())).thenResolve();
    when(mockedSFProjectService.get('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );
    this.testOnlineStatusService.setIsOnline(hasConnection);

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
    when(mockedFeatureFlagService.scriptureAudio).thenReturn({ enabled: true } as ObservableFeatureFlag);
    when(mockedFeatureFlagService.showNmtDrafting).thenReturn({ enabled: true } as ObservableFeatureFlag);

    when(mockedSFProjectService.queryAudioText(anything())).thenCall(sfProjectId => {
      const queryParams: QueryParameters = {
        [obj<TextAudio>().pathStr(t => t.projectRef)]: sfProjectId
      };
      return this.realtimeService.subscribeQuery(TextAudioDoc.COLLECTION, queryParams);
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

  get trainOnSourceSelect(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-project-select#trainOnSourceParatextId'));
  }

  get trainOnSourceStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#train-on-source-status'));
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

  get checkingShareCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-checking-share'));
  }

  get checkingShareStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checking-share-status'));
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

  get basedOnSelectValue(): string {
    return this.basedOnSelectComponent.paratextIdControl.value?.name || '';
  }

  get basedOnSelectComponent(): ProjectSelectComponent {
    return this.basedOnSelect.componentInstance as ProjectSelectComponent;
  }

  get basedOnSelectProjectsResources(): SelectableProject[] {
    return (this.basedOnSelectComponent.projects || []).concat(this.basedOnSelectComponent.resources || []);
  }

  get trainOnCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-train-on-enabled'));
  }

  get trainOnSourceSelectValue(): string {
    return this.trainOnSourceSelectComponent.paratextIdControl.value?.name || '';
  }

  get trainOnSourceSelectComponent(): ProjectSelectComponent {
    return this.trainOnSourceSelect.componentInstance as ProjectSelectComponent;
  }

  get trainOnSourceSelectProjectsResources(): SelectableProject[] {
    return (this.trainOnSourceSelectComponent.projects || []).concat(this.trainOnSourceSelectComponent.resources || []);
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

  resetTrainOnSourceProject(): void {
    this.trainOnSourceSelectComponent.paratextIdControl.setValue('');
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

  setBasedOnValue(value: string): void {
    this.basedOnSelectComponent.value = value;
    this.wait();
  }

  setTrainOnSourceValue(value: string): void {
    this.trainOnSourceSelectComponent.value = value;
    this.wait();
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
    tick();
  }

  setupProject(
    translateConfig: Partial<TranslateConfig> = {
      translationSuggestionsEnabled: true,
      source: {
        paratextId: 'paratextId01',
        projectRef: 'paratext01',
        name: 'ParatextP1',
        shortName: 'PT1',
        writingSystem: {
          tag: 'qaa'
        }
      },
      draftConfig: { lastSelectedBooks: [], trainOnEnabled: false }
    },
    checkingConfig: Partial<CheckingConfig> = {
      checkingEnabled: false,
      usersSeeEachOthersResponses: false
    },
    biblicalTermsEnabled: boolean = false,
    biblicalTermsMessage: string | undefined = undefined
  ): void {
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'project01',
      data: createTestProject({
        translateConfig,
        checkingConfig,
        biblicalTermsConfig: {
          biblicalTermsEnabled: biblicalTermsEnabled,
          errorMessage: biblicalTermsMessage,
          hasRenderings: false
        }
      })
    });
  }
}
