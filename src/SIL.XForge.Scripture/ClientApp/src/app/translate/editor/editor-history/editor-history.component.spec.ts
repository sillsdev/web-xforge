import { EventEmitter, NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import Quill, { Delta } from 'quill';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { Subject } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { Snapshot } from 'xforge-common/models/snapshot';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { Revision } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextComponent } from '../../../shared/text/text.component';
import { EditorHistoryComponent } from './editor-history.component';
import { EditorHistoryService } from './editor-history.service';
import { HistoryChooserComponent, RevisionSelectEvent } from './history-chooser/history-chooser.component';

describe('EditorHistoryComponent', () => {
  let component: EditorHistoryComponent;
  let fixture: ComponentFixture<EditorHistoryComponent>;
  const mockSFProjectService = mock(SFProjectService);
  const mockI18nService = mock(I18nService);
  const mockEditorHistoryService = mock(EditorHistoryService);
  const mockHistoryChooserComponent = mock(HistoryChooserComponent);

  const revisionSelect$ = new Subject<RevisionSelectEvent>();
  const showDiffChange$ = new Subject<boolean>();

  configureTestingModule(() => ({
    imports: [TestOnlineStatusModule.forRoot()],
    declarations: [EditorHistoryComponent],
    schemas: [NO_ERRORS_SCHEMA], // Ignore undeclared child components
    providers: [
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: SFProjectService, useMock: mockSFProjectService },
      { provide: I18nService, useMock: mockI18nService }
    ]
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(EditorHistoryComponent);
    component = fixture.componentInstance;
    mockHistoryChooserComponent.revisionSelect = revisionSelect$ as EventEmitter<RevisionSelectEvent>;
    mockHistoryChooserComponent.showDiffChange = showDiffChange$ as EventEmitter<boolean>;
  });

  it('should clear loadedRevision and emit revisionSelect on ngOnChanges', () => {
    component.loadedRevision = {} as Revision;
    component.isViewInitialized = true;
    spyOn(component.revisionSelect, 'emit');

    component.ngOnChanges();

    expect(component.loadedRevision).toBeUndefined();
    expect(component.revisionSelect.emit).toHaveBeenCalledWith(undefined);
  });

  it('should not emit revisionSelect on ngOnChanges when isViewInitialized is false', () => {
    component.loadedRevision = {} as Revision;
    component.isViewInitialized = false;
    spyOn(component.revisionSelect, 'emit');

    component.ngOnChanges();

    expect(component.loadedRevision).toBeUndefined();
    expect(component.revisionSelect.emit).not.toHaveBeenCalled();
  });

  it('should load history after view init', fakeAsync(() => {
    const diff = new Delta();
    const revision: Revision = { timestamp: 'date_here' };
    const textDoc: TextDoc = { data: { ops: [] } } as unknown as TextDoc;
    const snapshot: Snapshot<TextData> = {
      data: { ops: [] } as TextData,
      id: '',
      type: ''
    };

    const mockEditor = jasmine.createSpyObj<Quill>(['updateContents']);
    const mockTextComponent = jasmine.createSpyObj<TextComponent>(['applyEditorStyles', 'setContents'], {
      id: {} as TextDocId,
      editor: mockEditor
    });

    when(mockSFProjectService.getText(anything())).thenReturn(Promise.resolve(textDoc));
    when(mockEditorHistoryService.processDiff(anything(), anything())).thenReturn(diff);

    component.historyChooser = mockHistoryChooserComponent;
    component.snapshotText = mockTextComponent;
    component.diffText = mockTextComponent;
    component.ngAfterViewInit();

    revisionSelect$.next({ revision, snapshot });
    showDiffChange$.next(false);
    tick();

    expect(mockTextComponent.setContents).toHaveBeenCalledTimes(2);
    expect(mockTextComponent.editor!.updateContents).toHaveBeenCalledTimes(1); // Test if diff set
  }));

  it('should not reload history if browser goes offline and comes back online', fakeAsync(() => {
    const onlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
    const diff = new Delta();
    const revision: Revision = { timestamp: 'date_here' };
    const textDoc: TextDoc = { data: { ops: [] } } as unknown as TextDoc;
    const snapshot: Snapshot<TextData> = {
      data: { ops: [] } as TextData,
      id: '',
      type: ''
    };

    const mockEditor = jasmine.createSpyObj<Quill>(['updateContents']);
    const mockTextComponent = jasmine.createSpyObj<TextComponent>(['applyEditorStyles', 'setContents'], {
      id: {} as TextDocId,
      editor: mockEditor
    });

    when(mockSFProjectService.getText(anything())).thenReturn(Promise.resolve(textDoc));
    when(mockEditorHistoryService.processDiff(anything(), anything())).thenReturn(diff);

    component.historyChooser = mockHistoryChooserComponent;
    component.snapshotText = mockTextComponent;
    component.diffText = mockTextComponent;
    component.ngAfterViewInit();

    revisionSelect$.next({ revision, snapshot });
    showDiffChange$.next(false);
    tick();
    expect(mockTextComponent.setContents).toHaveBeenCalled();

    // Clear call count
    mockTextComponent.setContents.calls.reset();

    // Go offline
    onlineStatusService.setIsOnline(false);
    tick();
    expect(mockTextComponent.setContents).not.toHaveBeenCalled();

    // Go back online
    onlineStatusService.setIsOnline(true);
    tick();
    expect(mockTextComponent.setContents).not.toHaveBeenCalled();
  }));
});
