import { HttpErrorResponse } from '@angular/common/http';
import { SimpleChange } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { anything, mock, verify, when } from 'ts-mockito';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectProfileDoc } from '../../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../../../core/models/sf-type-registry';
import { ParatextService } from '../../../../core/paratext.service';
import { SFProjectService } from '../../../../core/sf-project.service';
import { TextDocService } from '../../../../core/text-doc.service';
import { HistoryChooserComponent } from './history-chooser.component';
import { HistoryRevisionFormatPipe } from './history-revision-format.pipe';

const mockedDialogService = mock(DialogService);
const mockedNoticeService = mock(NoticeService);
const mockedParatextService = mock(ParatextService);
const mockedProjectService = mock(SFProjectService);
const mockedTextDocService = mock(TextDocService);
const mockedErrorReportingService = mock(ErrorReportingService);

describe('HistoryChooserComponent', () => {
  configureTestingModule(() => ({
    imports: [
      NoopAnimationsModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      TestTranslocoModule,
      UICommonModule
    ],
    declarations: [HistoryChooserComponent, HistoryRevisionFormatPipe],
    providers: [
      { provide: DialogService, useMock: mockedDialogService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: ParatextService, useMock: mockedParatextService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: TextDocService, useMock: mockedTextDocService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService }
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
    expect(env.historySelect).toBeNull();
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
    expect(env.historySelect).toBeNull();
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
    verify(mockedTextDocService.overwrite(anything(), anything(), anything())).never();
  }));

  it('should not revert if the snapshot is missing', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedDialogService.confirm(anything(), anything())).thenCall(() => {
      // Simulate an out of order event altering the selected snapshot
      env.component.selectedSnapshot = undefined;
      return Promise.resolve(true);
    });
    env.triggerNgOnChanges();
    env.wait();
    env.clickRevertHistoryButton();
    verify(mockedDialogService.confirm(anything(), anything())).once();
    verify(mockedNoticeService.showError(anything())).once();
    verify(mockedTextDocService.overwrite(anything(), anything(), anything())).never();
    expect(env.component.selectedSnapshot).toBeUndefined();
  }));

  it('should not display the revert history button if the user cannot restore', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedTextDocService.canRestore(anything(), 40, 1)).thenReturn(false);
    env.triggerNgOnChanges();
    env.wait();
    expect(env.revertHistoryButton).toBeNull();
  }));

  it('should not display the revert history button if snapshot is corrupt', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedParatextService.getSnapshot('project01', 'MAT', 1, 'date_here')).thenReject(
      new HttpErrorResponse({ status: 409 })
    );
    env.triggerNgOnChanges();
    env.wait();
    expect(env.revertHistoryButton).toBeNull();
    expect(env.component.selectedSnapshot).toBeUndefined();
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
    verify(mockedTextDocService.overwrite(anything(), anything(), anything())).once();
    verify(mockedProjectService.onlineSetIsValid(anything(), anything(), anything(), env.isSnapshotValid)).once();
    verify(mockedNoticeService.show(anything())).once();
    verify(mockedErrorReportingService.silentError(anything(), anything())).never();
  }));

  it('should revert to the snapshot without updating chapter validity', fakeAsync(() => {
    const env = new TestEnvironment({
      texts: [
        {
          bookNum: 40,
          chapters: [{ number: 1, isValid: true, lastVerse: 30, permissions: { user1: TextInfoPermission.Write } }],
          permissions: { user1: TextInfoPermission.Write },
          hasSource: false
        }
      ]
    });
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
    verify(mockedTextDocService.overwrite(anything(), anything(), anything())).once();
    verify(mockedProjectService.onlineSetIsValid(anything(), anything(), anything(), anything())).never();
    verify(mockedNoticeService.show(anything())).once();
    verify(mockedErrorReportingService.silentError(anything(), anything())).never();
  }));

  it('shows message if failed to restore previous version', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
    env.triggerNgOnChanges();
    env.wait();
    expect(env.component.selectedRevision).toBeDefined();
    expect(env.component.selectedSnapshot?.data.ops).toBeDefined();
    expect(env.component.projectId).toBeDefined();
    expect(env.component.bookNum).toBeDefined();
    expect(env.component.chapter).toBeDefined();

    when(mockedProjectService.onlineSetIsValid(anything(), anything(), anything(), anything())).thenReject(
      new CommandError(CommandErrorCode.Other, '504 Gateway Timeout')
    );
    env.clickRevertHistoryButton();
    verify(mockedDialogService.confirm(anything(), anything())).once();
    verify(mockedTextDocService.overwrite(anything(), anything(), anything())).never();
    verify(mockedProjectService.onlineSetIsValid(anything(), anything(), anything(), env.isSnapshotValid)).once();
    verify(mockedNoticeService.showError(anything())).once();
    verify(mockedNoticeService.show(anything())).never();
    verify(mockedErrorReportingService.silentError(anything(), anything())).never();
  }));

  it('shows message and report to bugsnag if failed to restore previous version', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
    env.triggerNgOnChanges();
    env.wait();
    expect(env.component.selectedRevision).toBeDefined();
    expect(env.component.selectedSnapshot?.data.ops).toBeDefined();
    expect(env.component.projectId).toBeDefined();
    expect(env.component.bookNum).toBeDefined();
    expect(env.component.chapter).toBeDefined();

    when(mockedProjectService.onlineSetIsValid(anything(), anything(), anything(), anything())).thenReject(
      new CommandError(CommandErrorCode.Other, 'Unknown Error')
    );
    env.clickRevertHistoryButton();
    verify(mockedDialogService.confirm(anything(), anything())).once();
    verify(mockedTextDocService.overwrite(anything(), anything(), anything())).never();
    verify(mockedProjectService.onlineSetIsValid(anything(), anything(), anything(), env.isSnapshotValid)).once();
    verify(mockedNoticeService.showError(anything())).once();
    verify(mockedNoticeService.show(anything())).never();
    verify(mockedErrorReportingService.silentError(anything(), anything())).once();
  }));

  it('should show message if user is offline and clicks revert button', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
    env.triggerNgOnChanges();
    env.wait();
    expect(env.component.selectedRevision).toBeDefined();
    expect(env.component.selectedSnapshot?.data.ops).toBeDefined();
    expect(env.component.projectId).toBeDefined();
    expect(env.component.bookNum).toBeDefined();
    expect(env.component.chapter).toBeDefined();
    env.testOnlineStatusService.setIsOnline(false);
    env.clickRevertHistoryButton();
    verify(mockedDialogService.confirm(anything(), anything())).never();
    verify(mockedTextDocService.overwrite(anything(), anything(), anything())).never();
    verify(mockedProjectService.onlineSetIsValid(anything(), anything(), anything(), env.isSnapshotValid)).never();
    verify(mockedNoticeService.show(anything())).once();
  }));

  class TestEnvironment {
    readonly component: HistoryChooserComponent;
    readonly fixture: ComponentFixture<HistoryChooserComponent>;
    readonly realtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
    readonly testOnlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
    isSnapshotValid = true;

    constructor(projectData: Partial<SFProjectProfile> = {}) {
      this.fixture = TestBed.createComponent(HistoryChooserComponent);
      this.component = this.fixture.componentInstance;
      this.component.projectId = 'project01';
      this.component.bookNum = 40;
      this.component.chapter = 1;

      this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
        id: 'project01',
        data: createTestProjectProfile(projectData)
      });

      when(mockedParatextService.getRevisions('project01', 'MAT', 1)).thenResolve([{ timestamp: 'date_here' }]);
      when(mockedParatextService.getSnapshot('project01', 'MAT', 1, 'date_here')).thenResolve({
        data: { ops: [] },
        id: 'id',
        type: '',
        v: 1,
        isValid: this.isSnapshotValid
      });
      when(mockedProjectService.getProfile('project01')).thenCall(() =>
        this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, 'project01')
      );
      when(mockedTextDocService.canRestore(anything(), 40, 1)).thenReturn(true);
    }

    get historySelect(): HTMLElement {
      return this.fixture.nativeElement.querySelector('.history-select') as HTMLElement;
    }

    get revertHistoryButton(): HTMLElement {
      return this.fixture.nativeElement.querySelector('.revert-history') as HTMLElement;
    }

    get showDiffButton(): HTMLElement {
      return this.fixture.nativeElement.querySelector('.show-diff') as HTMLElement;
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
