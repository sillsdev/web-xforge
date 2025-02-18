import { ComponentFixture, TestBed } from '@angular/core/testing';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { EventMetricsComponent } from './event-metrics.component';

describe('EventMetricsComponent', () => {
  configureTestingModule(() => ({
    imports: [TestTranslocoModule]
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
