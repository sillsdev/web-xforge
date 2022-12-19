import { NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareControlComponent } from './share-control.component';
import { ShareDialogComponent } from './share-dialog.component';
import { ShareComponent } from './share.component';

const mockedProjectService = mock(SFProjectService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedUserService = mock(UserService);
const mockedPwaService = mock(PwaService);

describe('ShareComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, TestTranslocoModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY), UICommonModule],
    declarations: [ShareComponent],
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: UserService, useMock: mockedUserService },
      { provide: PwaService, useMock: mockedPwaService }
    ]
  }));

  it('dialog should open when clicked', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();

    env.clickElement(env.shareButton);

    env.clickElement(env.closeButton);
    verify(mockedProjectService.onlineInvite('project01', anything(), anything(), anything())).never();
    expect().nothing();
  }));
});

@NgModule({
  imports: [NoopAnimationsModule, UICommonModule, TestTranslocoModule],
  exports: [ShareDialogComponent, ShareControlComponent],
  declarations: [ShareDialogComponent, ShareControlComponent]
})
class DialogTestModule {}

class TestEnvironment {
  readonly component: ShareComponent;
  readonly fixture: ComponentFixture<ShareComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    when(mockedPwaService.onlineStatus$).thenReturn(of(true));
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(mockedProjectService.getProfile(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id)
    );

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
    return this.overlayContainerElement.querySelector('button[mat-dialog-close]') as HTMLButtonElement;
  }

  clickElement(element: HTMLElement): void {
    element.click();
    flush();
    this.fixture.detectChanges();
  }

  wait() {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}
