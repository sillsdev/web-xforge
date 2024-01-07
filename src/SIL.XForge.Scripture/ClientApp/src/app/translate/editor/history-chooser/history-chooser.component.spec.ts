import { HttpClientTestingModule } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { mock, when } from 'ts-mockito';
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
    imports: [
      HttpClientTestingModule,
      NoopAnimationsModule,
      TestOnlineStatusModule.forRoot(),
      TestTranslocoModule,
      UICommonModule
    ],
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

  it('should close when the close button is clicked', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    expect(env.closeButton).toBeUndefined();
    env.clickShowHideButton();
    expect(env.closeButton.hidden).toBeFalsy();
    env.clickCloseButton();
    expect(env.closeButton).toBeUndefined();
  }));

  it('should show and hide when the show/hide button is clicked', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    expect(env.historySelect).toBeUndefined();
    env.clickShowHideButton();
    expect(env.historySelect.hidden).toBeFalsy();
    env.clickShowHideButton();
    expect(env.historySelect).toBeUndefined();
  }));

  it('should show and hide diff when the diff button is clicked', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    expect(env.showDiffButton).toBeUndefined();
    env.clickShowHideButton();
    expect(env.component.showDiff).toBeFalsy();
    expect(env.showDiffButton.hidden).toBeFalsy();
    env.clickShowDiffButton();
    expect(env.component.showDiff).toBeTruthy();
    env.clickShowDiffButton();
    expect(env.component.showDiff).toBeFalsy();
  }));

  it('should get the first revision on show', fakeAsync(() => {
    const env = new TestEnvironment();
    env.wait();
    expect(env.component.historyRevision).toBeUndefined();
    expect(env.component.snapshot).toBeUndefined();
    expect(env.historySelect).toBeUndefined();
    env.clickShowHideButton();
    expect(env.historySelect.hidden).toBeFalsy();
    expect(env.component.historyRevision).not.toBeNull();
    expect(env.component.snapshot).not.toBeNull();
  }));

  it('should allow no revisions', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedParatextService.getRevisions('project01', 'MAT', 1)).thenResolve(undefined);
    env.wait();
    expect(env.component.historyRevision).toBeUndefined();
    expect(env.component.snapshot).toBeUndefined();
    expect(env.historySelect).toBeUndefined();
    env.clickShowHideButton();
    expect(env.historySelect.hidden).toBeFalsy();
    expect(env.component.historyRevision).toBeUndefined();
    expect(env.component.snapshot).toBeUndefined();
  }));

  class TestEnvironment {
    readonly component: HistoryChooserComponent;
    readonly fixture: ComponentFixture<HistoryChooserComponent>;

    constructor() {
      this.fixture = TestBed.createComponent(HistoryChooserComponent);
      this.component = this.fixture.componentInstance;
      this.component.projectId = 'project01';
      this.component.bookNum = 40;
      this.component.chapter = 1;

      when(mockedParatextService.getRevisions('project01', 'MAT', 1)).thenResolve([
        { key: 'date_here', value: 'description_here' }
      ]);
      when(mockedParatextService.getSnapshot('project01', 'MAT', 1, 'date_here')).thenResolve({
        data: {},
        id: 'id',
        type: '',
        v: 1
      });
      when(mockedI18nService.locale).thenReturn({
        localName: 'English',
        englishName: 'English',
        canonicalTag: 'en',
        direction: 'ltr',
        tags: ['en'],
        production: false
      });
    }

    get closeButton(): HTMLElement {
      return this.fixture.nativeElement.querySelectorAll('#close')[0] as HTMLElement;
    }

    get historySelect(): HTMLElement {
      return this.fixture.nativeElement.querySelectorAll('#history-select')[0] as HTMLElement;
    }

    get showDiffButton(): HTMLElement {
      return this.fixture.nativeElement.querySelectorAll('#show-diff')[0] as HTMLElement;
    }

    clickCloseButton(): void {
      this.closeButton.click();
      flush();
      this.fixture.detectChanges();
    }

    clickShowDiffButton(): void {
      this.showDiffButton.click();
      flush();
      this.fixture.detectChanges();
    }

    clickShowHideButton(): void {
      this.fixture.nativeElement.querySelectorAll('#show-hide')[0].click();
      flush();
      this.fixture.detectChanges();
    }

    wait(): void {
      this.fixture.detectChanges();
      tick();
      this.fixture.detectChanges();
    }
  }
});
