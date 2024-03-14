import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { BehaviorSubject } from 'rxjs';
import { mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { SFProjectService } from '../core/sf-project.service';
import { ServalProjectComponent } from './serval-project.component';

const mockActivatedProjectService = mock(ActivatedProjectService);
const mockActivatedRoute = mock(ActivatedRoute);
const mockSFProjectService = mock(SFProjectService);

describe('ServalProjectComponent', () => {
  configureTestingModule(() => ({
    imports: [
      ServalProjectComponent,
      NoopAnimationsModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      HttpClientTestingModule
    ],
    providers: [
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: ActivatedRoute, useMock: mockActivatedRoute },
      { provide: SFProjectService, useMock: mockSFProjectService }
    ]
  }));

  it('should allow enabling pre-translation drafting', fakeAsync(() => {
    const env = new TestEnvironment(false);
    expect(env.preTranslateCheckbox.checked).toBeFalsy();
    env.clickElement(env.preTranslateCheckbox);
    expect(env.preTranslateCheckbox.checked).toBeTruthy();
    verify(mockSFProjectService.onlineSetPreTranslate(env.mockProjectId, true)).once();
  }));

  it('should allow disabling pre-translation drafting', fakeAsync(() => {
    const env = new TestEnvironment(true);
    expect(env.preTranslateCheckbox.checked).toBeTruthy();
    env.clickElement(env.preTranslateCheckbox);
    expect(env.preTranslateCheckbox.checked).toBeFalsy();
    verify(mockSFProjectService.onlineSetPreTranslate(env.mockProjectId, false)).once();
  }));

  class TestEnvironment {
    readonly component: ServalProjectComponent;
    readonly fixture: ComponentFixture<ServalProjectComponent>;

    mockProjectId = 'project01';

    constructor(preTranslate: boolean) {
      const mockProjectId$ = new BehaviorSubject<string>(this.mockProjectId);
      const mockProjectDoc = {
        id: this.mockProjectId,
        data: createTestProjectProfile({
          translateConfig: {
            preTranslate: preTranslate
          }
        })
      } as SFProjectProfileDoc;
      const mockProjectDoc$ = new BehaviorSubject<SFProjectProfileDoc>(mockProjectDoc);

      when(mockActivatedProjectService.projectId).thenReturn(this.mockProjectId);
      when(mockActivatedProjectService.projectId$).thenReturn(mockProjectId$);
      when(mockActivatedProjectService.projectDoc).thenReturn(mockProjectDoc);
      when(mockActivatedProjectService.projectDoc$).thenReturn(mockProjectDoc$);

      this.fixture = TestBed.createComponent(ServalProjectComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
    }

    get preTranslateCheckbox(): HTMLInputElement {
      return this.fixture.nativeElement.querySelector('mat-checkbox input');
    }

    clickElement(button: HTMLElement): void {
      button.click();
      this.fixture.detectChanges();
      tick();
      this.fixture.detectChanges();
    }
  }
});
