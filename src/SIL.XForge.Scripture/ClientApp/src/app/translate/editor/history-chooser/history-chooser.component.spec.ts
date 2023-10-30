import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { mock } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { ParatextService } from '../../../core/paratext.service';

import { HistoryChooserComponent } from './history-chooser.component';

const mockedI18nService = mock(I18nService);
const mockedParatextService = mock(ParatextService);

describe('HistoryChooserComponent', () => {
  configureTestingModule(() => ({
    imports: [HttpClientTestingModule, TestOnlineStatusModule.forRoot(), TestTranslocoModule, UICommonModule],
    declarations: [HistoryChooserComponent],
    providers: [
      { provide: I18nService, useMock: mockedI18nService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: ParatextService, useMock: mockedParatextService }
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
