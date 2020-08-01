import { MdcDialogModule, MdcDialogRef } from '@angular-mdc/web/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import { NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { CheckingConfig, CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { of } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { LocationService } from 'xforge-common/location.service';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareControlComponent } from './share-control.component';
import { ShareDialogComponent } from './share-dialog.component';
import { ShareComponent } from './share.component';

const mockedMdcDialogRef: MdcDialogRef<ShareDialogComponent> = mock(MdcDialogRef);
const mockedProjectService = mock(SFProjectService);
const mockedNoticeService = mock(NoticeService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedLocationService = mock(LocationService);
const mockedUserService = mock(UserService);
const mockedPwaService = mock(PwaService);

describe('ShareComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, TestTranslocoModule],
    declarations: [ShareComponent],
    providers: [
      { provide: MdcDialogRef, useMock: mockedMdcDialogRef },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: LocationService, useMock: mockedLocationService },
      { provide: UserService, useMock: mockedUserService },
      { provide: PwaService, useMock: mockedPwaService }
    ]
  }));

  it('share button should be hidden when sharing is disabled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setShareConfig(false, CheckingShareLevel.Anyone);
    env.wait();

    expect(env.shareButton).toBeNull();

    env.updateSharingProperties(true, CheckingShareLevel.Anyone);
    expect(env.shareButton).not.toBeNull();

    env.updateSharingProperties(false, CheckingShareLevel.Anyone);
    expect(env.shareButton).toBeNull();
  }));

  it('share button should be shown to project admin even when sharing is turned off', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setShareConfig(false, CheckingShareLevel.Anyone, SFProjectRole.ParatextAdministrator);
    env.wait();

    expect(env.shareButton).not.toBeNull();
  }));

  it('dialog should open when sharing is enabled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();

    env.clickElement(env.shareButton);

    env.clickElement(env.closeButton);
    verify(mockedProjectService.onlineInvite('project01', anything())).never();
    expect().nothing();
  }));

  it('dialog should not send when email is invalid', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();

    env.clickElement(env.shareButton);
    env.clickElement(env.emailInput);
    env.setInputValue(env.emailInput, 'notAnEmailAddress');
    env.clickElement(env.sendInviteButton);

    env.clickElement(env.closeButton);
    verify(mockedProjectService.onlineInvite('project01', anything())).never();
    expect().nothing();
  }));

  it('dialog should not send when email is empty', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();

    env.clickElement(env.shareButton);
    env.setInputValue(env.emailInput, 'notAnEmailAddress');
    env.clickElement(env.emailInput);
    env.setInputValue(env.emailInput, '');
    env.clickElement(env.sendInviteButton);

    env.clickElement(env.closeButton);
    verify(mockedProjectService.onlineInvite('project01', anything())).never();
    expect().nothing();
  }));

  it('dialog should send when email is valid', fakeAsync(() => {
    const emailAddress = 'me@example.com';
    const env = new TestEnvironment();
    env.wait();

    env.clickElement(env.shareButton);
    env.setInputValue(env.emailInput, emailAddress);
    expect(env.emailInput.querySelector('input')!.value).toBe(emailAddress);
    env.clickElement(env.sendInviteButton);

    env.clickElement(env.closeButton);
    verify(mockedProjectService.onlineInvite('project01', emailAddress)).once();
  }));

  it('share link should be hidden if link sharing is turned off', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setShareConfig(true, CheckingShareLevel.Specific);
    env.wait();

    env.clickElement(env.shareButton);
    expect(env.shareLink).toBeNull();
  }));

  it('clicking copy link icon should copy link to clipboard', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();

    env.clickElement(env.shareButton);
    expect(env.shareLink.value).toEqual('https://scriptureforge.org/projects/project01?sharing=true');
    env.clickElement(env.shareLinkCopyIcon);
    // TODO: figure out a way to check the clipboard data
    verify(mockedNoticeService.show(anything())).once();
  }));
});

@NgModule({
  imports: [
    FormsModule,
    MdcDialogModule,
    ReactiveFormsModule,
    NoopAnimationsModule,
    UICommonModule,
    TestTranslocoModule,
    TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
  ],
  exports: [ShareDialogComponent, ShareControlComponent],
  declarations: [ShareDialogComponent, ShareControlComponent],
  entryComponents: [ShareDialogComponent, ShareControlComponent]
})
class DialogTestModule {}

class TestEnvironment {
  readonly component: ShareComponent;
  readonly fixture: ComponentFixture<ShareComponent>;
  readonly overlayContainer: OverlayContainer;

  private readonly realtimeService: TestRealtimeService = TestBed.get<TestRealtimeService>(TestRealtimeService);

  constructor() {
    when(mockedProjectService.onlineInvite('project01', anything())).thenResolve();
    when(mockedNoticeService.show(anything())).thenResolve();
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(mockedLocationService.origin).thenReturn('https://scriptureforge.org');
    when(mockedProjectService.get('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedPwaService.isOnline).thenReturn(true);
    when(mockedPwaService.onlineStatus).thenReturn(of(true));

    this.setShareConfig(true, CheckingShareLevel.Anyone);

    this.fixture = TestBed.createComponent(ShareComponent);
    this.component = this.fixture.componentInstance;
    this.overlayContainer = TestBed.get(OverlayContainer);
  }

  get shareButton(): HTMLButtonElement {
    return this.fixture.nativeElement.querySelector('#share-btn');
  }

  get sendInviteButton(): HTMLButtonElement {
    const overlayContainerElement = this.overlayContainer.getContainerElement();
    return overlayContainerElement.querySelector('#send-btn') as HTMLButtonElement;
  }

  get closeButton(): HTMLButtonElement {
    const overlayContainerElement = this.overlayContainer.getContainerElement();
    return overlayContainerElement.querySelector('#close-btn') as HTMLButtonElement;
  }

  get emailInput(): HTMLElement {
    const overlayContainerElement = this.overlayContainer.getContainerElement();
    return overlayContainerElement.querySelector('#email') as HTMLElement;
  }

  get shareLink(): HTMLInputElement {
    const overlayContainerElement = this.overlayContainer.getContainerElement();
    return overlayContainerElement.querySelector('#share-link input') as HTMLInputElement;
  }

  get shareLinkCopyIcon(): HTMLElement {
    const overlayContainerElement = this.overlayContainer.getContainerElement();
    return overlayContainerElement.querySelector('#share-link-copy-icon') as HTMLElement;
  }

  clickElement(element: HTMLElement): void {
    element.click();
    flush();
    this.fixture.detectChanges();
  }

  setInputValue(textField: HTMLElement, value: string): void {
    const inputElem = textField.querySelector('input') as HTMLInputElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    this.fixture.detectChanges();
    tick();
  }

  setShareConfig(shareEnabled: boolean, shareLevel: CheckingShareLevel, role = SFProjectRole.CommunityChecker): void {
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'project01',
      data: {
        name: 'project 01',
        paratextId: 'pt01',
        shortName: 'P01',
        writingSystem: { tag: 'qaa' },
        translateConfig: { translationSuggestionsEnabled: false },
        checkingConfig: {
          checkingEnabled: true,
          usersSeeEachOthersResponses: true,
          shareEnabled,
          shareLevel
        },
        sync: { queuedCount: 0 },
        texts: [],
        userRoles: {
          user01: role
        }
      }
    });
  }

  wait() {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  updateSharingProperties(shareEnabled: boolean, shareLevel: CheckingShareLevel): void {
    const projectDoc: SFProjectDoc = this.realtimeService.get(SFProjectDoc.COLLECTION, 'project01');
    const oldConfig = projectDoc.data!.checkingConfig;
    const newConfig: CheckingConfig = {
      checkingEnabled: oldConfig.checkingEnabled,
      usersSeeEachOthersResponses: oldConfig.usersSeeEachOthersResponses,
      shareEnabled,
      shareLevel
    };
    projectDoc.submitJson0Op(op => {
      op.set(p => p.checkingConfig, newConfig);
    });
    tick();
    this.fixture.detectChanges();
  }
}
