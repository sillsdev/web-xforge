import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { mock } from 'ts-mockito';
import { PwaService } from 'xforge-common/pwa.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { ParatextService } from '../../../core/paratext.service';

import { HistoryChooserComponent } from './history-chooser.component';

const mockedParatextService = mock(ParatextService);
const mockedPwaService = mock(PwaService);

describe('HistoryChooserComponent', () => {
  configureTestingModule(() => ({
    imports: [HttpClientTestingModule, TestTranslocoModule, UICommonModule],
    declarations: [HistoryChooserComponent],
    providers: [
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: PwaService, useMock: mockedPwaService }
    ]
  }));

  it('should create', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    expect(env.component).toBeTruthy();
  }));

  class TestEnvironment {
    readonly component: HistoryChooserComponent;
    readonly fixture: ComponentFixture<HistoryChooserComponent>;

    constructor() {
      this.fixture = TestBed.createComponent(HistoryChooserComponent);
      this.component = this.fixture.componentInstance;
      this.component.projectId = 'project01';
    }

    wait(): void {
      this.fixture.detectChanges();
      tick();
      this.fixture.detectChanges();
    }
  }
});
