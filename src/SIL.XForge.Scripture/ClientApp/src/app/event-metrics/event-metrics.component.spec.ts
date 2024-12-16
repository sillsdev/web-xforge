import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { EventMetricsComponent } from './event-metrics.component';

describe('EventMetricsComponent', () => {
  configureTestingModule(() => ({
    imports: [
      EventMetricsComponent,
      NoopAnimationsModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
  }));

  it('should be created', () => {
    const env = new TestEnvironment();
    expect(env.component).toBeTruthy();
  });

  class TestEnvironment {
    readonly component: EventMetricsComponent;
    readonly fixture: ComponentFixture<EventMetricsComponent>;

    constructor() {
      this.fixture = TestBed.createComponent(EventMetricsComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
    }
  }
});
