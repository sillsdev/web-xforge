import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { ShareButtonComponent } from './share-button.component';

const mockedActivatedRoute = mock(ActivatedRoute);

describe('ShareButtonComponent', () => {
  configureTestingModule(() => ({
    imports: [
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      TestOnlineStatusModule.forRoot(),
      UICommonModule
    ],
    providers: [{ provide: ActivatedRoute, useMock: mockedActivatedRoute }]
  }));

  it('dialog should open when clicked', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();

    env.clickElement(env.shareButton);

    env.clickElement(env.closeButton);
    expect().nothing();
  }));
});

class TestEnvironment {
  readonly component: ShareButtonComponent;
  readonly fixture: ComponentFixture<ShareButtonComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));

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
