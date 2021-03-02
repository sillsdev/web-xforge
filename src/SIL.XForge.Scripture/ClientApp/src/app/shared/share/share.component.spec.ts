import { MdcDialogModule, MdcDialogRef } from '@angular-mdc/web/dialog';
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
import { I18nService } from 'xforge-common/i18n.service';
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
const mockedI18nService = mock(I18nService);

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
      { provide: PwaService, useMock: mockedPwaService },
      { provide: I18nService, useMock: mockedI18nService }
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
    verify(mockedProjectService.onlineInvite('project01', anything(), anything(), anything())).never();
    expect().nothing();
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
  declarations: [ShareDialogComponent, ShareControlComponent]
})
class DialogTestModule {}

class TestEnvironment {
  readonly component: ShareComponent;
  readonly fixture: ComponentFixture<ShareComponent>;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    when(mockedProjectService.onlineInvite('project01', anything(), anything(), anything())).thenResolve();
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
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get shareButton(): HTMLButtonElement {
    return this.fixture.nativeElement.querySelector('#share-btn');
  }

  get closeButton(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector('#close-btn') as HTMLButtonElement;
  }

  clickElement(element: HTMLElement): void {
    element.click();
    flush();
    this.fixture.detectChanges();
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
