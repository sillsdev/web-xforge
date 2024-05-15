import { HttpClientTestingModule } from '@angular/common/http/testing';
import { SimpleChange } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { anything, mock, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { ParatextService } from '../../../../core/paratext.service';
import { TextDocService } from '../../../../core/text-doc.service';
import { HistoryChooserComponent } from './history-chooser.component';
import { HistoryRevisionFormatPipe } from './history-revision-format.pipe';

const mockedDialogService = mock(DialogService);
const mockedI18nService = mock(I18nService);
const mockedNoticeService = mock(NoticeService);
const mockedParatextService = mock(ParatextService);
const mockedTextDocService = mock(TextDocService);

describe('HistoryChooserComponent', () => {
  configureTestingModule(() => ({
    imports: [
      HttpClientTestingModule,
      NoopAnimationsModule,
      TestOnlineStatusModule.forRoot(),
      TestTranslocoModule,
      UICommonModule
    ],
    declarations: [HistoryChooserComponent, HistoryRevisionFormatPipe],
    providers: [
      { provide: DialogService, useMock: mockedDialogService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: TextDocService, useMock: mockedTextDocService }
    ]
  }));

  it('should show and hide diff when the diff button is clicked', fakeAsync(() => {
    const env = new TestEnvironment();
    env.triggerNgOnChanges();
    env.wait();
    expect(env.component.showDiff).toBeTruthy();
    expect(env.showDiffButton.hidden).toBeFalsy();
    env.clickShowDiffButton();
    expect(env.component.showDiff).toBeFalsy();
    env.clickShowDiffButton();
    expect(env.component.showDiff).toBeTruthy();
  }));

  it('should get the first revision on load if online', fakeAsync(() => {
    const env = new TestEnvironment();
    env.triggerNgOnChanges();
    env.wait();
    expect(env.component.selectedRevision).toBeDefined();
    expect(env.historySelect).toBeDefined();
    expect(env.historySelect.hidden).toBeFalsy();
  }));

  it('should not fetch revisions on load if offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.testOnlineStatusService.setIsOnline(false);
    env.triggerNgOnChanges();
    env.wait();
    expect(env.component.selectedRevision).toBeUndefined();
    expect(env.historySelect).toBeUndefined();
  }));

  it('should fetch revisions when coming online', fakeAsync(() => {
    const env = new TestEnvironment();
    env.testOnlineStatusService.setIsOnline(false);
    env.triggerNgOnChanges();
    env.wait();
    env.testOnlineStatusService.setIsOnline(true);
    env.wait();
    expect(env.component.selectedRevision).toBeDefined();
    expect(env.historySelect).toBeDefined();
  }));

  it('should retain revisions when going offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.triggerNgOnChanges();
    env.wait();
    env.testOnlineStatusService.setIsOnline(false);
    env.wait();
    expect(env.component.selectedRevision).toBeDefined();
    expect(env.historySelect).toBeDefined();
  }));

  it('should allow no revisions', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedParatextService.getRevisions('project01', 'MAT', 1)).thenResolve(undefined);
    env.triggerNgOnChanges();
    env.wait();
    expect(env.historySelect).toBeUndefined();
    expect(env.component.selectedRevision).toBeUndefined();
  }));

  it('should not revert if the user clicks cancel', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(false);
    env.triggerNgOnChanges();
    env.wait();
    expect(env.component.selectedSnapshot).toBeDefined();
    env.clickRevertHistoryButton();
    verify(mockedDialogService.confirm(anything(), anything())).once();
    verify(mockedTextDocService.overwrite(anything(), anything())).never();
  }));

  it('should not revert if the snapshot is missing', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedParatextService.getSnapshot('project01', 'MAT', 1, 'date_here')).thenResolve({
      data: {},
      id: 'id',
      type: '',
      v: 1
    });
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
    env.triggerNgOnChanges();
    env.wait();
    env.clickRevertHistoryButton();
    verify(mockedDialogService.confirm(anything(), anything())).once();
    verify(mockedNoticeService.showError(anything())).once();
    verify(mockedTextDocService.overwrite(anything(), anything())).never();
    expect(env.component.selectedSnapshot?.data.ops).toBeUndefined();
  }));

  it('should revert to the snapshot', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
    env.triggerNgOnChanges();
    env.wait();
    expect(env.component.selectedRevision).toBeDefined();
    expect(env.component.selectedSnapshot?.data.ops).toBeDefined();
    expect(env.component.projectId).toBeDefined();
    expect(env.component.bookNum).toBeDefined();
    expect(env.component.chapter).toBeDefined();
    env.clickRevertHistoryButton();
    verify(mockedDialogService.confirm(anything(), anything())).once();
    verify(mockedTextDocService.overwrite(anything(), anything())).once();
  }));

  class TestEnvironment {
    readonly component: HistoryChooserComponent;
    readonly fixture: ComponentFixture<HistoryChooserComponent>;
    readonly testOnlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;

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
        data: { ops: [] },
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

    get historySelect(): HTMLElement {
      return this.fixture.nativeElement.querySelectorAll('#history-select')[0] as HTMLElement;
    }

    get revertHistoryButton(): HTMLElement {
      return this.fixture.nativeElement.querySelectorAll('#revert-history')[0] as HTMLElement;
    }

    get showDiffButton(): HTMLElement {
      return this.fixture.nativeElement.querySelectorAll('#show-diff')[0] as HTMLElement;
    }

    clickRevertHistoryButton(): void {
      this.revertHistoryButton.click();
      flush();
      this.fixture.detectChanges();
    }

    clickShowDiffButton(): void {
      this.showDiffButton.click();
      flush();
      this.fixture.detectChanges();
    }

    triggerNgOnChanges(): void {
      this.component.ngOnChanges({
        bookNum: { currentValue: 40 } as SimpleChange
      });
    }

    wait(): void {
      this.fixture.detectChanges();
      tick();
      this.fixture.detectChanges();
      tick();
    }
  }
});
