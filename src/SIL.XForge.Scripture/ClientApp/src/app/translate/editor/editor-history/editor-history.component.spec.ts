import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import Quill from 'quill';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { Subject } from 'rxjs';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { anything, mock, when } from 'ts-mockito';
import { Snapshot } from 'xforge-common/models/snapshot';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { Delta, TextDoc, TextDocId } from '../../../core/models/text-doc';
import { Revision } from '../../../core/paratext.service';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { TextComponent } from '../../../shared/text/text.component';
import { EditorHistoryComponent } from './editor-history.component';
import { EditorHistoryService } from './editor-history.service';
import { HistoryChooserComponent, RevisionSelectEvent } from './history-chooser/history-chooser.component';

describe('EditorHistoryComponent', () => {
  let component: EditorHistoryComponent;
  let fixture: ComponentFixture<EditorHistoryComponent>;
  const mockSFProjectService = mock(SFProjectService);
  const mockEditorHistoryService = mock(EditorHistoryService);
  const mockHistoryChooserComponent = mock(HistoryChooserComponent);

  // Not sure how to do this with ts-mockito
  const mockEditor = jasmine.createSpyObj<Quill>(['setContents', 'updateContents']);
  const mockTextComponent = jasmine.createSpyObj<TextComponent>([], {
    id: {} as TextDocId,
    editor: mockEditor
  });

  const revisionSelect$ = new Subject<RevisionSelectEvent>();
  const showDiffChange$ = new Subject<boolean>();

  configureTestingModule(() => ({
    imports: [NoticeComponent, TestOnlineStatusModule.forRoot()],
    declarations: [EditorHistoryComponent],
    schemas: [NO_ERRORS_SCHEMA], // Ignore undeclared child components
    providers: [
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: SFProjectService, useMock: mockSFProjectService },
      { provide: EditorHistoryService, useMock: mockEditorHistoryService },
      { provide: HistoryChooserComponent, useMock: mockHistoryChooserComponent },
      { provide: TextComponent, useValue: mockTextComponent },
      { provide: Quill, useValue: mockEditor }
    ]
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(EditorHistoryComponent);
    component = fixture.componentInstance;
    mockHistoryChooserComponent.revisionSelect = revisionSelect$ as EventEmitter<RevisionSelectEvent>;
    mockHistoryChooserComponent.showDiffChange = showDiffChange$ as EventEmitter<boolean>;
  });

  it('should load history after view init', fakeAsync(() => {
    const diff = new Delta();
    const revision: Revision = { key: 'date_here', value: 'description_here' };
    const textDoc: TextDoc = { data: { ops: [] } } as unknown as TextDoc;
    const snapshot: Snapshot<TextData> = {
      data: { ops: [] } as TextData,
      id: '',
      type: ''
    };

    when(mockSFProjectService.getText(anything())).thenReturn(Promise.resolve(textDoc));
    when(mockEditorHistoryService.processDiff(anything(), anything())).thenReturn(diff);

    component.historyChooser = mockHistoryChooserComponent;
    component.snapshotText = mockTextComponent;
    component.diffText = mockTextComponent;
    component.ngAfterViewInit();

    revisionSelect$.next({ revision, snapshot });
    showDiffChange$.next(false);
    tick();

    expect(mockTextComponent.editor!.setContents).toHaveBeenCalledTimes(2);
    expect(mockTextComponent.editor!.updateContents).toHaveBeenCalledTimes(1); // Test if diff set
  }));

  it('should reload history if browser goes offline and comes back online', fakeAsync(() => {
    const onlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
    const diff = new Delta();
    const revision: Revision = { key: 'date_here', value: 'description_here' };
    const textDoc: TextDoc = { data: { ops: [] } } as unknown as TextDoc;
    const snapshot: Snapshot<TextData> = {
      data: { ops: [] } as TextData,
      id: '',
      type: ''
    };

    when(mockSFProjectService.getText(anything())).thenReturn(Promise.resolve(textDoc));
    when(mockEditorHistoryService.processDiff(anything(), anything())).thenReturn(diff);

    component.historyChooser = mockHistoryChooserComponent;
    component.snapshotText = mockTextComponent;
    component.diffText = mockTextComponent;
    component.ngAfterViewInit();

    revisionSelect$.next({ revision, snapshot });
    showDiffChange$.next(false);
    tick();
    expect(mockTextComponent.editor!.setContents).toHaveBeenCalled();

    // Clear call count
    (mockTextComponent.editor! as jasmine.SpyObj<Quill>).setContents.calls.reset();

    // Go offline
    onlineStatusService.setIsOnline(false);
    tick();
    expect(mockTextComponent.editor!.setContents).not.toHaveBeenCalled();

    // Go back online
    onlineStatusService.setIsOnline(true);
    tick();
    expect(mockTextComponent.editor!.setContents).toHaveBeenCalled();
  }));
});
