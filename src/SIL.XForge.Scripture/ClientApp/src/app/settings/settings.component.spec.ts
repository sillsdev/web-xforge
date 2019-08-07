import { OverlayContainer } from '@angular-mdc/web';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import * as OTJson0 from 'ot-json0';
import { BehaviorSubject, of } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { ParatextProject } from 'xforge-common/models/paratext-project';
import { SharingLevel } from 'xforge-common/models/sharing-level';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { ParatextService } from 'xforge-common/paratext.service';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { WriteStatusComponent } from 'xforge-common/write-status/write-status.component';
import { SFProject } from '../core/models/sfproject';
import { SFProjectDoc } from '../core/models/sfproject-doc';
import { SFProjectService } from '../core/sfproject.service';
import { DeleteProjectDialogComponent } from './delete-project-dialog/delete-project-dialog.component';
import { SettingsComponent } from './settings.component';

describe('SettingsComponent', () => {
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

    it('unchecking the last task should report error, retick last task, and not send an update', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.wait();
      // prove error div is absent
      expect(env.atLeastOneError).toBeNull();
      expect(env.inputElement(env.checkingCheckbox).checked).toBe(false);
      expect(env.inputElement(env.translateCheckbox).checked).toBe(true);
      env.clickElement(env.inputElement(env.translateCheckbox));
      expect(env.inputElement(env.translateCheckbox).checked).toBe(false);
      // error div should now be present
      expect(env.atLeastOneError).not.toBeNull();
      tick(1000);
      env.fixture.detectChanges();
      expect(env.inputElement(env.translateCheckbox).checked).toBe(true);
      expect(env.statusDone(env.translateStatus)).toBeNull();
    }));

    it('changing state of task option results in status icon', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.wait();
      expect(env.statusDone(env.checkingStatus)).toBeNull();
      expect(env.inputElement(env.checkingCheckbox).checked).toBe(false);
      env.clickElement(env.inputElement(env.checkingCheckbox));
      tick();
      env.fixture.detectChanges();
      expect(env.statusDone(env.checkingStatus)).not.toBeNull();

      expect(env.statusDone(env.translateStatus)).toBeNull();
      expect(env.inputElement(env.translateCheckbox).checked).toBe(true);
      env.clickElement(env.inputElement(env.translateCheckbox));
      tick();
      env.fixture.detectChanges();
      expect(env.statusDone(env.translateStatus)).not.toBeNull();
    }));

    it('error on data submit shows error icon', fakeAsync(() => {
      const env = new TestEnvironment();
      when(
        env.mockedSFProjectService.onlineUpdateSettings('project01', deepEqual({ usersSeeEachOthersResponses: true }))
      ).thenReject('Network error');
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

    describe('Translate options', () => {
      it('should see login button when Paratext account not connected', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.setupParatextProjects(null);
        env.wait();
        expect(env.loginButton).not.toBeNull();
        expect(env.inputElement(env.translateCheckbox).disabled).toBe(true);
        expect(env.basedOnSelect).toBeNull();
      }));

      it('should hide Based On when Translate is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        env.clickElement(env.inputElement(env.checkingCheckbox));
        expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);
        expect(env.inputElement(env.translateCheckbox).checked).toBe(true);
        expect(env.loginButton).toBeNull();
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelect.nativeElement.textContent).toContain('ParatextP1');

        env.clickElement(env.inputElement(env.translateCheckbox));

        expect(env.inputElement(env.translateCheckbox).checked).toBe(false);
        expect(env.basedOnSelect).toBeNull();
        expect(env.loginButton).toBeNull();
      }));

      it('should retain Based On value when Translate is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        env.clickElement(env.inputElement(env.checkingCheckbox));
        expect(env.inputElement(env.checkingCheckbox).checked).toBe(true);
        expect(env.inputElement(env.translateCheckbox).checked).toBe(true);
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelect.nativeElement.textContent).toContain('ParatextP1');

        env.clickElement(env.inputElement(env.translateCheckbox));

        env.wait();
        expect(env.inputElement(env.translateCheckbox).checked).toBe(false);
        expect(env.statusDone(env.translateStatus)).not.toBeNull();

        env.clickElement(env.inputElement(env.translateCheckbox));

        env.wait();
        expect(env.statusDone(env.translateStatus)).not.toBeNull();
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelect.nativeElement.textContent).toContain('ParatextP1');
      }));

      it('should change Based On select value', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        env.wait();
        expect(env.inputElement(env.translateCheckbox).checked).toBe(true);
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelect.nativeElement.textContent).toContain('ParatextP1');
        expect(env.statusDone(env.basedOnStatus)).toBeNull();

        env.setSelectValue(env.basedOnSelect, 'paratextId02');

        expect(env.basedOnSelect.nativeElement.textContent).toContain('ParatextP2');
        expect(env.statusDone(env.basedOnStatus)).not.toBeNull();
      }));

      it('should not save Translate enable if Based On not set', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          projectName: 'project01',
          checkingEnabled: true,
          usersSeeEachOthersResponses: false,
          shareEnabled: false,
          translateEnabled: false,
          sourceParatextId: undefined
        });
        tick();
        env.fixture.detectChanges();
        env.wait();
        expect(env.inputElement(env.translateCheckbox).checked).toBe(false);
        expect(env.statusNone(env.translateStatus)).toBe(true);
        expect(env.loginButton).toBeNull();
        expect(env.basedOnSelect).toBeNull();

        env.clickElement(env.inputElement(env.translateCheckbox));

        expect(env.inputElement(env.translateCheckbox).checked).toBe(true);
        expect(env.statusNone(env.translateStatus)).toBe(true);
        expect(env.loginButton).toBeNull();
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.basedOnSelect.nativeElement.textContent).toEqual('Based on');
        expect(env.statusDone(env.basedOnStatus)).toBeNull();
      }));

      it('should save Translate disable if Based On not set', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          projectName: 'project01',
          checkingEnabled: true,
          usersSeeEachOthersResponses: false,
          shareEnabled: false,
          translateEnabled: false,
          sourceParatextId: undefined
        });
        env.wait();
        env.clickElement(env.inputElement(env.translateCheckbox));
        expect(env.statusNone(env.translateStatus)).toBe(true);

        env.clickElement(env.inputElement(env.translateCheckbox));
        tick();
        env.fixture.detectChanges();

        expect(env.statusNone(env.translateStatus)).toBe(true);
      }));

      it('should save Translate and Based On when Based On set', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject({
          projectName: 'project01',
          checkingEnabled: true,
          usersSeeEachOthersResponses: false,
          shareEnabled: false,
          translateEnabled: false,
          sourceParatextId: undefined
        });
        env.wait();
        env.clickElement(env.inputElement(env.translateCheckbox));
        expect(env.inputElement(env.translateCheckbox).checked).toBe(true);
        expect(env.basedOnSelect).not.toBeNull();
        expect(env.statusNone(env.translateStatus)).toBe(true);
        expect(env.statusNone(env.basedOnStatus)).toBe(true);
        expect(env.basedOnSelect.nativeElement.textContent).toEqual('Based on');
        expect(env.statusDone(env.translateStatus)).toBeNull();
        expect(env.statusDone(env.basedOnStatus)).toBeNull();

        env.setSelectValue(env.basedOnSelect, 'paratextId02');

        expect(env.basedOnSelect.nativeElement.textContent).toContain('ParatextP2');
        expect(env.statusDone(env.translateStatus)).not.toBeNull();
        expect(env.statusDone(env.basedOnStatus)).not.toBeNull();
      }));
    });

    describe('Checking options', () => {
      it('should hide options when Checking is disabled', fakeAsync(() => {
        const env = new TestEnvironment();
        env.setupProject();
        env.wait();
        expect(env.inputElement(env.translateCheckbox).checked).toBe(true);
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
        env.setupProject({
          projectName: 'project01',
          checkingEnabled: true,
          usersSeeEachOthersResponses: false,
          shareEnabled: true,
          shareLevel: SharingLevel.Anyone,
          translateEnabled: false,
          sourceParatextId: undefined
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
      expect(env.currentProjectId).toBeUndefined();
      verify(env.mockedSFProjectService.onlineDelete(anything())).once();
    }));

    it('should not delete project if user cancels', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject();
      env.wait();
      env.clickElement(env.deleteProjectButton);
      expect(env.deleteDialog).not.toBeNull();
      env.confirmDialog(false);
      expect(env.currentProjectId).toEqual('project01');
      verify(env.mockedSFProjectService.onlineDelete(anything())).never();
    }));
  });
});

class TestEnvironment {
  readonly component: SettingsComponent;
  readonly fixture: ComponentFixture<SettingsComponent>;
  readonly overlayContainer: OverlayContainer;

  readonly mockedActivatedRoute: ActivatedRoute = mock(ActivatedRoute);
  readonly mockedAuthService: AuthService = mock(AuthService);
  readonly mockedNoticeService: NoticeService = mock(NoticeService);
  readonly mockedParatextService: ParatextService = mock(ParatextService);
  readonly mockedSFProjectService: SFProjectService = mock(SFProjectService);
  readonly mockedUserService: UserService = mock(UserService);
  readonly mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);

  private projectDoc: SFProjectDoc;
  private readonly paratextProjects$: BehaviorSubject<ParatextProject[]>;
  private readonly currentUserDoc: UserDoc;

  constructor() {
    when(this.mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    this.paratextProjects$ = new BehaviorSubject<ParatextProject[]>([
      {
        paratextId: 'paratextId01',
        name: 'ParatextP1',
        languageTag: 'qaa',
        languageName: 'unspecified',
        isConnectable: true,
        isConnected: false
      },
      {
        paratextId: 'paratextId02',
        name: 'ParatextP2',
        languageTag: 'qaa',
        languageName: 'unspecified',
        isConnectable: true,
        isConnected: false
      }
    ]);
    when(this.mockedParatextService.getProjects()).thenReturn(this.paratextProjects$);
    when(this.mockedSFProjectService.onlineDelete(anything())).thenResolve();
    when(this.mockedSFProjectService.onlineUpdateSettings('project01', anything())).thenResolve();
    this.currentUserDoc = new UserDoc(
      new MemoryRealtimeDocAdapter('user01', OTJson0.type, { sites: { sf: { currentProjectId: 'project01' } } }),
      instance(this.mockedRealtimeOfflineStore)
    );
    when(this.mockedUserService.getCurrentUser()).thenResolve(this.currentUserDoc);
    TestBed.configureTestingModule({
      imports: [DialogTestModule, HttpClientTestingModule, RouterTestingModule, UICommonModule],
      declarations: [SettingsComponent, WriteStatusComponent],
      providers: [
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: AuthService, useFactory: () => instance(this.mockedAuthService) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: ParatextService, useFactory: () => instance(this.mockedParatextService) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedSFProjectService) },
        { provide: UserService, useFactory: () => instance(this.mockedUserService) }
      ]
    });
    this.fixture = TestBed.createComponent(SettingsComponent);
    this.component = this.fixture.componentInstance;
    this.overlayContainer = TestBed.get(OverlayContainer);
  }

  get currentProjectId(): string {
    return this.currentUserDoc.data.sites.sf.currentProjectId;
  }

  get atLeastOneError(): DebugElement {
    return this.fixture.debugElement.query(By.css('.invalid-feedback'));
  }

  get translateCheckbox(): DebugElement {
    return this.fixture.debugElement.query(By.css('#checkbox-translate'));
  }

  get translateStatus(): DebugElement {
    return this.fixture.debugElement.query(By.css('#translate-status'));
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
    return oce.querySelector('mdc-dialog');
  }

  get confirmDeleteBtn(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('#project-delete-btn');
  }

  get cancelDeleteBtn(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('#cancel-btn');
  }

  confirmDialog(confirm: boolean): void {
    let button: HTMLElement;
    const oce = this.overlayContainer.getContainerElement();
    if (confirm) {
      const projectInput: HTMLInputElement = oce.querySelector('#project-entry').querySelector('input');
      projectInput.value = this.projectDoc.data.projectName;
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
    project: Partial<SFProject> = {
      checkingEnabled: false,
      usersSeeEachOthersResponses: false,
      shareEnabled: false,
      translateEnabled: true,
      sourceParatextId: 'paratextId01'
    }
  ) {
    this.projectDoc = new SFProjectDoc(
      new MemoryRealtimeDocAdapter('project01', OTJson0.type, project),
      instance(this.mockedRealtimeOfflineStore)
    );
    when(this.mockedSFProjectService.get('project01')).thenResolve(this.projectDoc);
  }

  setupParatextProjects(paratextProjects: ParatextProject[]) {
    this.paratextProjects$.next(paratextProjects);
  }
}

@NgModule({
  imports: [UICommonModule],
  declarations: [DeleteProjectDialogComponent],
  entryComponents: [DeleteProjectDialogComponent],
  exports: [DeleteProjectDialogComponent]
})
class DialogTestModule {}
