import { OverlayContainer } from '@angular/cdk/overlay';
import { Location } from '@angular/common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, Route } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { CookieService } from 'ngx-cookie-service';
import { CheckingConfig, CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { TranslateConfig } from 'realtime-server/lib/scriptureforge/models/translate-config';
import { BehaviorSubject, of } from 'rxjs';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { WriteStatusComponent } from 'xforge-common/write-status/write-status.component';
import { ParatextProject } from '../core/models/paratext-project';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { ParatextService } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';
import { DeleteProjectDialogComponent } from './delete-project-dialog/delete-project-dialog.component';
import { SettingsComponent } from './settings.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedAuthService = mock(AuthService);
const mockedNoticeService = mock(NoticeService);
const mockedParatextService = mock(ParatextService);
const mockedSFProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedCookieService = mock(CookieService);
const mockedPwaService = mock(PwaService);

@Component({
  template: `<div>Mock</div>`
})
class MockComponent {}

const ROUTES: Route[] = [{ path: 'projects', component: MockComponent }];

describe('SettingsComponent', () => {
  configureTestingModule(() => ({
    imports: [
      DialogTestModule,
      HttpClientTestingModule,
      RouterTestingModule.withRoutes(ROUTES),
      UICommonModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    declarations: [SettingsComponent, WriteStatusComponent, MockComponent],
    providers: [
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: PwaService, useMock: mockedPwaService }
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

    describe('Translation Suggestions options', () => {
      it('should see login button when Paratext account not connected', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.setupParatextProjects(undefined);
        env.wait();
        expect(env.loginButton).not.toBeNull();
        expect(env.inputElement(env.translationSuggestionsCheckbox).disabled).toBe(true);
        expect(env.basedOnSelect).toBeNull();
      }));

      it('should hide Based On when Translation Suggestions is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        env.clickElement(env.inputElement(env.checkingCheckbox));
        expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.loginButton).toBeNull();
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelect.nativeElement.innerText).toContain('ParatextP1');

        env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));

        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(false);
        expect(env.basedOnSelect).toBeNull();
        expect(env.loginButton).toBeNull();
      }));

      it('should retain Based On value when Translation Suggestions is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        env.clickElement(env.inputElement(env.checkingCheckbox));
        expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelect.nativeElement.innerText).toContain('ParatextP1');

        env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));

        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(false);
        expect(env.statusDone(env.translationSuggestionsStatus)).not.toBeNull();

        env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));

        env.wait();
        expect(env.statusDone(env.translationSuggestionsStatus)).not.toBeNull();
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelect.nativeElement.innerText).toContain('ParatextP1');
      }));

      it('should change Based On select value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelect.nativeElement.innerText).toContain('ParatextP1');
        expect(env.statusDone(env.basedOnStatus)).toBeNull();

        env.setSelectValue(env.basedOnSelect, 'paratextId02');

        expect(env.basedOnSelect.nativeElement.innerText).toContain('ParatextP2');
        expect(env.statusDone(env.basedOnStatus)).not.toBeNull();
      }));

      it('should display Based On project even if user is not a member', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.setupParatextProjects([
          {
            paratextId: 'paratextId02',
            name: 'ParatextP2',
            shortName: 'PT2',
            languageTag: 'qaa',
            isConnectable: true,
            isConnected: false
          }
        ]);
        env.wait();
        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.getMenuItems(env.basedOnSelect).length).toEqual(2);
        expect(env.getMenuItemText(env.basedOnSelect, 0)).toContain('ParatextP1');
        expect(env.getMenuItemText(env.basedOnSelect, 1)).toContain('ParatextP2');
      }));

      it('should not save Translation Suggestions enable if Based On not set', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translationSuggestionsEnabled: false
        });
        tick();
        env.fixture.detectChanges();
        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(false);
        expect(env.statusNone(env.translationSuggestionsStatus)).toBe(true);
        expect(env.loginButton).toBeNull();
        expect(env.basedOnSelect).toBeNull();

        env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));

        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.statusNone(env.translationSuggestionsStatus)).toBe(true);
        expect(env.loginButton).toBeNull();
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelect.nativeElement.innerText).toEqual('Based on');
        expect(env.statusDone(env.basedOnStatus)).toBeNull();
      }));

      it('should save Translation Suggestions disable if Based On not set', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translationSuggestionsEnabled: false
        });
        env.wait();
        env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
        expect(env.statusNone(env.translationSuggestionsStatus)).toBe(true);

        env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
        tick();
        env.fixture.detectChanges();

        expect(env.statusNone(env.translationSuggestionsStatus)).toBe(true);
      }));

      it('should save Translation Suggestions and Based On when Based On set', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          translationSuggestionsEnabled: false
        });
        env.wait();
        env.clickElement(env.inputElement(env.translationSuggestionsCheckbox));
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.statusNone(env.translationSuggestionsStatus)).toBe(true);
        expect(env.statusNone(env.basedOnStatus)).toBe(true);
        expect(env.basedOnSelect.nativeElement.innerText).toEqual('Based on');
        expect(env.statusDone(env.translationSuggestionsStatus)).toBeNull();
        expect(env.statusDone(env.basedOnStatus)).toBeNull();

        env.setSelectValue(env.basedOnSelect, 'paratextId02');

        expect(env.basedOnSelect.nativeElement.innerText).toContain('ParatextP2');
        expect(env.statusDone(env.translationSuggestionsStatus)).not.toBeNull();
        expect(env.statusDone(env.basedOnStatus)).not.toBeNull();
      }));
    });

    describe('Checking options', () => {
      it('should hide options when Checking is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        expect(env.inputElement(env.translationSuggestionsCheckbox).checked).toBe(true);
        expect(env.inputElement(env.checkingCheckbox).checked).toBe(false);
        expect(env.seeOthersResponsesCheckbox).toBeNull();
        expect(env.shareCheckbox).toBeNull();
        env.clickElement(env.inputElement(env.checkingCheckbox));
        expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);
        expect(env.seeOthersResponsesCheckbox).not.toBeNull();
        expect(env.shareCheckbox).not.toBeNull();
      }));

      it('changing state of checking option results in status icon', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        env.clickElement(env.inputElement(env.checkingCheckbox));
        expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);

        expect(env.statusDone(env.seeOthersResponsesStatus)).toBeNull();
        env.clickElement(env.inputElement(env.seeOthersResponsesCheckbox));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.seeOthersResponsesStatus)).not.toBeNull();

        expect(env.statusDone(env.shareStatus)).toBeNull();
        env.clickElement(env.inputElement(env.shareCheckbox));
        tick();
        env.fixture.detectChanges();
        expect(env.statusDone(env.shareStatus)).not.toBeNull();
      }));

      it('share level should be disabled if share set to false', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject(undefined, {
          checkingEnabled: true,
          usersSeeEachOthersResponses: false,
          shareEnabled: true,
          shareLevel: CheckingShareLevel.Anyone
        });
        env.wait();

        expect(env.component.form.controls.shareLevel.disabled).toEqual(false);
        env.clickElement(env.inputElement(env.shareCheckbox));
        expect(env.component.form.controls.shareLevel.disabled).toEqual(true);
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

    it('should delete project if user confirms on the dialog', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.wait();
      env.clickElement(env.deleteProjectButton);
      expect(env.deleteDialog).not.toBeNull();
      env.confirmDialog(true);
      verify(mockedUserService.setCurrentProjectId()).once();
      verify(mockedSFProjectService.onlineDelete(anything())).once();
      expect(env.location.path()).toEqual('/projects');
    }));

    it('should not delete project if user cancels', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.wait();
      env.clickElement(env.deleteProjectButton);
      expect(env.deleteDialog).not.toBeNull();
      env.confirmDialog(false);
      verify(mockedUserService.setCurrentProjectId()).never();
      verify(mockedSFProjectService.onlineDelete(anything())).never();
    }));
  });
});

class TestEnvironment {
  readonly component: SettingsComponent;
  readonly fixture: ComponentFixture<SettingsComponent>;
  readonly overlayContainer: OverlayContainer;
  readonly location: Location;

  private readonly realtimeService: TestRealtimeService = TestBed.get<TestRealtimeService>(TestRealtimeService);
  private isOnline: BehaviorSubject<boolean>;

  constructor(hasConnection: boolean = true) {
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(mockedSFProjectService.onlineDelete(anything())).thenResolve();
    when(mockedSFProjectService.onlineUpdateSettings('project01', anything())).thenResolve();
    when(mockedUserService.currentProjectId).thenReturn('project01');
    when(mockedSFProjectService.get('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );
    this.isOnline = new BehaviorSubject<boolean>(hasConnection);
    when(mockedPwaService.onlineStatus).thenReturn(this.isOnline.asObservable());
    when(mockedPwaService.isOnline).thenReturn(this.isOnline.getValue());
    this.setupParatextProjects([
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

    this.fixture = TestBed.createComponent(SettingsComponent);
    this.component = this.fixture.componentInstance;
    this.overlayContainer = TestBed.get(OverlayContainer);
    this.location = TestBed.get(Location);
  }

  get atLeastOneError(): DebugElement {
    return this.fixture.debugElement.query(By.css('.invalid-feedback'));
  }

  get translationSuggestionsCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-translation-suggestions'));
  }

  get translationSuggestionsStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#translation-suggestions-status'));
  }

  get basedOnSelect(): DebugElement {
    return this.fixture.debugElement.query(By.css('#based-on-select'));
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

  get shareCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-share'));
  }

  get shareStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#share-status'));
  }

  get dangerZoneTitle(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#danger-zone div');
  }

  get deleteProjectButton(): HTMLButtonElement {
    return this.fixture.nativeElement.querySelector('#delete-btn');
  }

  get deleteDialog(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('mdc-dialog') as HTMLElement;
  }

  get confirmDeleteBtn(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('#project-delete-btn') as HTMLElement;
  }

  get cancelDeleteBtn(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('#cancel-btn') as HTMLElement;
  }

  get offlineMessage(): HTMLElement {
    return this.fixture.nativeElement.querySelector('.offline-text');
  }

  set onlineStatus(hasConnection: boolean) {
    this.isOnline.next(hasConnection);
    tick();
    this.fixture.detectChanges();
  }

  confirmDialog(confirm: boolean): void {
    let button: HTMLElement;
    const oce = this.overlayContainer.getContainerElement();
    if (confirm) {
      const projectInput = oce.querySelector('#project-entry')!.querySelector('input') as HTMLInputElement;
      projectInput.value = 'project 01';
      projectInput.dispatchEvent(new Event('input'));
      button = this.confirmDeleteBtn;
    } else {
      button = this.cancelDeleteBtn;
    }
    this.fixture.detectChanges();
    tick();
    this.clickElement(button);
    tick();
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

  statusNone(element: DebugElement): boolean {
    return element.children.length === 0;
  }

  statusDone(element: DebugElement): HTMLElement {
    return element.nativeElement.querySelector('.check-icon') as HTMLElement;
  }

  statusError(element: DebugElement): HTMLElement {
    return element.nativeElement.querySelector('.error-icon') as HTMLElement;
  }

  setSelectValue(element: DebugElement, value: string): void {
    element.componentInstance.setSelectionByValue(value);
    this.wait();
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
    tick();
  }

  setupProject(
    translateConfig: TranslateConfig = {
      translationSuggestionsEnabled: true,
      source: {
        paratextId: 'paratextId01',
        name: 'ParatextP1',
        shortName: 'PT1',
        writingSystem: {
          tag: 'qaa'
        }
      }
    },
    checkingConfig: CheckingConfig = {
      checkingEnabled: false,
      usersSeeEachOthersResponses: false,
      shareEnabled: false,
      shareLevel: CheckingShareLevel.Specific
    }
  ) {
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'project01',
      data: {
        name: 'project 01',
        paratextId: 'pt01',
        shortName: 'P01',
        writingSystem: {
          tag: 'en'
        },
        translateConfig,
        checkingConfig,
        sync: { queuedCount: 0 },
        texts: [],
        userRoles: {}
      }
    });
  }

  setupParatextProjects(paratextProjects: ParatextProject[] | undefined) {
    when(mockedParatextService.getProjects()).thenReturn(of(paratextProjects));
  }

  getMenuItems(menu: DebugElement): DebugElement[] {
    return menu.queryAll(By.css('mdc-list-item'));
  }

  getMenuItemText(menu: DebugElement, index: number): string {
    return this.getMenuItems(menu)[index].nativeElement.textContent.trim();
  }
}

@NgModule({
  imports: [UICommonModule, TestTranslocoModule],
  declarations: [DeleteProjectDialogComponent],
  entryComponents: [DeleteProjectDialogComponent],
  exports: [DeleteProjectDialogComponent]
})
class DialogTestModule {}
