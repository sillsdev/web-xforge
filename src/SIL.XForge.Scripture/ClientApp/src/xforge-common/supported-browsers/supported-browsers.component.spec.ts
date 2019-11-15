import { ComponentFixture, TestBed } from '@angular/core/testing';
import { configureTestingModule } from '../test-utils';
import { UICommonModule } from '../ui-common.module';
import { SupportedBrowsersComponent } from './supported-browsers.component';

describe('SupportedBrowsersComponent', () => {
  configureTestingModule(() => ({
    declarations: [SupportedBrowsersComponent],
    imports: [UICommonModule]
  }));

  it('should display message', () => {
    const env = new TestEnvironment();
    expect(env.titleMessage).toBe('This browser is unsupported');
  });
});

class TestEnvironment {
  readonly fixture: ComponentFixture<SupportedBrowsersComponent>;
  readonly component: SupportedBrowsersComponent;

  constructor() {
    this.fixture = TestBed.createComponent(SupportedBrowsersComponent);
    this.component = this.fixture.componentInstance;
  }

  get titleMessage(): string {
    return this.fixture.nativeElement.querySelector('h2').textContent;
  }
}
