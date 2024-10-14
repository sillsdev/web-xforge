import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareButtonComponent } from './share-button.component';

const mockedProjectService = mock(SFProjectService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedUserService = mock(UserService);

describe('ShareButtonComponent', () => {
  configureTestingModule(() => ({
    imports: [
      DialogTestModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      TestOnlineStatusModule.forRoot(),
      UICommonModule
    ],
    declarations: [ShareButtonComponent],
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: UserService, useMock: mockedUserService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService }
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
  providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
})
class DialogTestModule {}

class TestEnvironment {
  readonly component: ShareButtonComponent;
  readonly fixture: ComponentFixture<ShareButtonComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(mockedProjectService.getProfile(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id)
    );

    this.fixture = TestBed.createComponent(ShareButtonComponent);
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

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}
