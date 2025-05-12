import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { VerseRef } from '@sillsdev/scripture';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { BiblicalTerm, getBiblicalTermDocId } from 'realtime-server/lib/esm/scriptureforge/models/biblical-term';
import { Note } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { BIBLICAL_TERM_TAG_ID } from 'realtime-server/lib/esm/scriptureforge/models/note-tag';
import {
  getNoteThreadDocId,
  NoteConflictType,
  NoteStatus,
  NoteThread,
  NoteType
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { createTestProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config-test-data';
import { fromVerseRef, VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { BehaviorSubject, of } from 'rxjs';
import { anything, capture, instance, mock, verify, when } from 'ts-mockito';
import { GenericDialogComponent, GenericDialogOptions } from 'xforge-common/generic-dialog/generic-dialog.component';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { FETCH_WITHOUT_SUBSCRIBE } from 'xforge-common/models/realtime-doc';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { noopDestroyRef } from 'xforge-common/realtime.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { BiblicalTermDoc } from '../../core/models/biblical-term-doc';
import { NoteThreadDoc } from '../../core/models/note-thread-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { XmlUtils } from '../../shared/utils';
import { MockNoteDialogRef } from '../editor/editor.component.spec';
import { NoteDialogComponent } from '../editor/note-dialog/note-dialog.component';
import { BiblicalTermDialogIcon, BiblicalTermNoteIcon, BiblicalTermsComponent } from './biblical-terms.component';

const mockedI18nService = mock(I18nService);
const mockedMatDialog = mock(MatDialog);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);

describe('BiblicalTermsComponent', () => {
  configureTestingModule(() => ({
    imports: [
      NoopAnimationsModule,
      TestOnlineStatusModule.forRoot(),
      TestTranslocoModule,
      UICommonModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: I18nService, useMock: mockedI18nService },
      { provide: MatDialog, useMock: mockedMatDialog },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService }
    ]
  }));

  it('should display biblical terms', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
  }));

  it('should display biblical terms in the specified language', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1');
    env.setupProjectData('fr');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_fr');
  }));

  it('should display biblical terms in the default language if the specified language does not exist', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1');
    env.setupProjectData('de');
    env.wait();
    expect(I18nService.defaultLocale.canonicalTag).toBe('en');
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
  }));

  it('should display biblical terms in the default language if the specified language has blank values', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1');
    env.setupProjectData('es');
    env.wait();
    expect(I18nService.defaultLocale.canonicalTag).toBe('en');
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
  }));

  it('should display biblical terms with missing data', fakeAsync(() => {
    const env = new TestEnvironment('project01', 2, 2);
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId02');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('');
  }));

  it('should display transliterations when enabled', fakeAsync(() => {
    const env = new TestEnvironment('project02', 3, 3);
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('transliteration03');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category03_en');
  }));

  it('should filter biblical terms by category', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1');
    env.setupProjectData('en');
    env.wait();
    env.component.selectedRangeFilter = 'current_book';
    env.wait();
    env.component.selectedCategory = 'category04_en';
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId04');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category04_en');
    const projectUserConfig = env.getProjectUserConfigDoc('project01', 'user01').data;
    expect(projectUserConfig?.selectedBiblicalTermsFilter).toBe('current_book');
    expect(projectUserConfig?.selectedBiblicalTermsCategory).toBe('category04_en');
  }));

  it('should filter biblical terms by book', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1');
    env.setupProjectData('en');
    env.wait();
    env.component.selectedRangeFilter = 'current_book';
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(3);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
    expect((env.biblicalTermsTerm[1] as HTMLElement).innerText).toBe('termId04');
    expect((env.biblicalTermsCategory[1] as HTMLElement).innerText).toBe('category04_en');
    expect((env.biblicalTermsTerm[2] as HTMLElement).innerText).toBe('termId05');
    expect((env.biblicalTermsCategory[2] as HTMLElement).innerText).toBe('category05_en');
    expect(env.getProjectUserConfigDoc('project01', 'user01').data?.selectedBiblicalTermsFilter).toBe('current_book');
  }));

  it('should filter biblical terms by chapter', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1');
    env.setupProjectData('en');
    env.wait();
    env.component.selectedRangeFilter = 'current_chapter';
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(2);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
    expect((env.biblicalTermsTerm[1] as HTMLElement).innerText).toBe('termId04');
    expect((env.biblicalTermsCategory[1] as HTMLElement).innerText).toBe('category04_en');
    expect(env.getProjectUserConfigDoc('project01', 'user01').data?.selectedBiblicalTermsFilter).toBe(
      'current_chapter'
    );
  }));

  it('should filter biblical terms by verse', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1');
    env.component.selectedRangeFilter = 'current_verse';
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
  }));

  it('should update the categories when the language changes', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1');
    env.component.selectedRangeFilter = 'current_verse';
    env.component.selectedCategory = 'category01_en';
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
    expect(env.component.categories.includes('category01_en')).toBe(true);
    expect(env.component.categories.includes('category01_fr')).toBe(false);

    env.setLanguage('fr');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_fr');
    expect(env.component.categories.includes('category01_en')).toBe(false);
    expect(env.component.categories.includes('category01_fr')).toBe(true);
    expect(env.component.selectedCategory).toBe('show_all');
  }));

  it('should exclude biblical terms not in the selected verse', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '4');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(0);
  }));

  it('should include biblical terms in verse ranges', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1-2');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(2);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
    expect((env.biblicalTermsTerm[1] as HTMLElement).innerText).toBe('termId04');
    expect((env.biblicalTermsCategory[1] as HTMLElement).innerText).toBe('category04_en');
  }));

  it('should show biblical terms for partial verse', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1a');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
  }));

  it('should show add if no biblical terms notes', fakeAsync(() => {
    const env = new TestEnvironment('project01', 2, 2, '2');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect(env.biblicalTermsNotesIcon.innerText).toBe(BiblicalTermNoteIcon.AddNotesIcon);
  }));

  it('should show biblical terms notes', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect(env.biblicalTermsNotesIcon.innerText).toBe(BiblicalTermNoteIcon.ReadNotesIcon);
  }));

  it('should show unread biblical terms notes', fakeAsync(() => {
    const env = new TestEnvironment('project02', 3, 3);
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect(env.biblicalTermsNotesIcon.innerText).toBe(BiblicalTermNoteIcon.UnreadNotesIcon);
  }));

  it('should not allow observers to add notes', fakeAsync(async () => {
    const env = new TestEnvironment('project02', 3, 3);
    env.setupProjectData('en', false);
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect(env.biblicalTermsNotesIcon.innerText).toBe(BiblicalTermNoteIcon.NoNotesIcon);
  }));

  it('should show the edit button if the user has edit permission', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect(env.editBiblicalTermIcon.innerText).toBe(BiblicalTermDialogIcon.Edit);
  }));

  it('should show the view button if the user has view permission', fakeAsync(() => {
    const env = new TestEnvironment('project02', 3, 3);
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect(env.editBiblicalTermIcon.innerText).toBe(BiblicalTermDialogIcon.View);
  }));

  it('should update the transliterate biblical terms setting', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect(env.component.transliterateBiblicalTerms).toBe(false);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');

    env.component.transliterateBiblicalTerms = !env.component.transliterateBiblicalTerms;
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect(env.component.transliterateBiblicalTerms).toBe(true);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('transliteration01');
  }));

  it('can save a new note thread for a biblical term', fakeAsync(() => {
    const projectId = 'project01';
    const env = new TestEnvironment(projectId, 2, 2, '2');
    env.setupProjectData('en');
    env.wait();

    env.biblicalTermsNotesButton.click();
    env.wait();

    const noteContent: string = 'content in the thread & with an ampersand';
    env.mockNoteDialogRef.close({ noteContent });
    env.wait();

    verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
    const [, config] = capture(mockedMatDialog.open).last();
    const biblicalTermId: string = (config as MatDialogConfig).data!.biblicalTermId;
    expect(biblicalTermId.toString()).toEqual('dataId02');

    const biblicalTerm = env.getBiblicalTermDoc(projectId, biblicalTermId);
    const verseData: VerseRefData = fromVerseRef(new VerseRef(biblicalTerm.data!.references[0]));
    verify(mockedProjectService.createNoteThread(projectId, anything(), anything())).once();
    const [, noteThread] = capture(mockedProjectService.createNoteThread).last();
    expect(noteThread.verseRef).toEqual(verseData);
    expect(noteThread.originalSelectedText).toEqual('');
    expect(noteThread.publishedToSF).toBe(true);
    expect(noteThread.notes[0].ownerRef).toEqual('user01');
    expect(noteThread.notes[0].content).toEqual(XmlUtils.encodeForXml(noteContent));
    expect(noteThread.notes[0].tagId).toEqual(BIBLICAL_TERM_TAG_ID);
    const projectUserConfigDoc: SFProjectUserConfigDoc = env.getProjectUserConfigDoc('project01', 'user01');
    expect(projectUserConfigDoc.data!.noteRefsRead).not.toContain(noteThread.notes[0].dataId);
  }));

  it('can save a note for an existing biblical term', fakeAsync(() => {
    const projectId = 'project01';
    const noteDataId = 'dataId01';
    const env = new TestEnvironment(projectId, 1, 1);
    env.setupProjectData('en');
    env.wait();

    env.biblicalTermsNotesButton.click();
    env.wait();

    const noteContent: string = 'content in the thread';
    env.mockNoteDialogRef.close({ noteContent });
    env.wait();

    verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
    const [, config] = capture(mockedMatDialog.open).last();
    const biblicalTermId: string = (config as MatDialogConfig).data!.biblicalTermId;
    expect(biblicalTermId.toString()).toEqual(noteDataId);

    const biblicalTerm = env.getBiblicalTermDoc(projectId, biblicalTermId);
    const verseData: VerseRefData = fromVerseRef(new VerseRef(biblicalTerm.data!.references[0]));
    const noteThread = env.getNoteThreadDoc(projectId, 'threadId01').data!;
    expect(noteThread.verseRef).toEqual(verseData);
    expect(noteThread.originalSelectedText).toEqual('');
    expect(noteThread.publishedToSF).toBe(true);
    expect(noteThread.notes[1].ownerRef).toEqual('user01');
    expect(noteThread.notes[1].content).toEqual(noteContent);
    expect(noteThread.notes[1].tagId).toEqual(BIBLICAL_TERM_TAG_ID);
    const projectUserConfigDoc: SFProjectUserConfigDoc = env.getProjectUserConfigDoc('project01', 'user01');
    expect(projectUserConfigDoc.data!.noteRefsRead).toContain(noteThread.notes[1].dataId);
  }));

  it('can resolve a note for a biblical term', fakeAsync(() => {
    const projectId = 'project01';
    const env = new TestEnvironment(projectId, 1, 1);
    env.setupProjectData('en');
    env.wait();

    // SUT
    env.biblicalTermsNotesButton.click();
    env.wait();
    env.mockNoteDialogRef.close({ status: NoteStatus.Resolved });
    env.wait();

    verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
    const noteThread: NoteThread = env.getNoteThreadDoc(projectId, 'threadId01').data!;
    expect(noteThread.status).toBe(NoteStatus.Resolved);
    expect(noteThread.notes[1].content).toBeUndefined();
    expect(noteThread.notes[1].status).toBe(NoteStatus.Resolved);
  }));

  it('can resolve and edit a note for a biblical term', fakeAsync(async () => {
    const projectId = 'project01';
    const newContent = 'Updated Note Content';
    const env = new TestEnvironment(projectId, 1, 1);
    env.setupProjectData('en');
    env.wait();

    // Make the note editable
    const noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc(projectId, 'threadId01');
    await noteThreadDoc.submitJson0Op(op => op.set(nt => nt.notes[0].editable, true));

    // SUT
    env.biblicalTermsNotesButton.click();
    env.wait();
    env.mockNoteDialogRef.close({ status: NoteStatus.Resolved, noteContent: newContent, noteDataId: 'note01' });
    env.wait();

    verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
    const noteThread: NoteThread = env.getNoteThreadDoc(projectId, 'threadId01').data!;
    expect(noteThread.status).toBe(NoteStatus.Resolved);
    expect(noteThread.notes[0].content).toBe(newContent);
    expect(noteThread.notes[0].status).toBe(NoteStatus.Resolved);
  }));

  it('cannot resolve a non-editable note for a biblical term', fakeAsync(() => {
    const projectId = 'project01';
    const env = new TestEnvironment(projectId, 1, 1);
    env.setupProjectData('en');
    env.wait();

    // Stub the error message display
    const dialogMessage = spyOn((env.component as any).dialogService, 'message').and.stub();

    // SUT
    env.biblicalTermsNotesButton.click();
    env.wait();
    env.mockNoteDialogRef.close({ status: NoteStatus.Resolved, noteDataId: 'note01' });
    env.wait();

    verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
    const noteThread: NoteThread = env.getNoteThreadDoc(projectId, 'threadId01').data!;
    expect(noteThread.status).toEqual(NoteStatus.Todo);
    expect(noteThread.notes.length).toBe(1);
    expect(dialogMessage).toHaveBeenCalledTimes(1);
  }));

  it('should show the not found message if no messages were found', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '4');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(0);
    expect(env.noDataRow.length).toBe(1);
    expect(env.notFoundMessage.length).toBe(1);
  }));

  it('should show the offline message if not connected to internet', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '4');
    env.setupProjectData('en');
    env.onlineStatus = false;
    env.wait();
    expect(env.offlineMessage.length).toBe(1);
  }));

  it('should not show the not found message when loading the component', fakeAsync(() => {
    const env = new TestEnvironment(undefined, 1, 1, '4');
    env.wait();
    expect(env.noDataRow.length).toBe(1);
    expect(env.notFoundMessage.length).toBe(0);
  }));
});

class TestEnvironment {
  readonly component: BiblicalTermsComponent;
  readonly fixture: ComponentFixture<BiblicalTermsComponent>;
  readonly mockNoteDialogRef;
  readonly mockedDialogRef = mock<MatDialogRef<GenericDialogComponent<any>, GenericDialogOptions<any>>>(MatDialogRef);
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  readonly locale$: BehaviorSubject<Locale> = new BehaviorSubject<Locale>({} as Locale);
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  private openNoteDialogs: MockNoteDialogRef[] = [];

  constructor(projectId: string | undefined, bookNum: number, chapter: number, verse: string = '0') {
    when(mockedI18nService.locale$).thenReturn(this.locale$);
    when(mockedProjectService.queryBiblicalTerms(anything(), anything())).thenCall(sfProjectId => {
      const parameters: QueryParameters = {
        [obj<BiblicalTerm>().pathStr(t => t.projectRef)]: sfProjectId
      };
      return this.realtimeService.subscribeQuery(BiblicalTermDoc.COLLECTION, parameters, noopDestroyRef);
    });
    when(mockedProjectService.queryBiblicalTermNoteThreads(anything(), anything())).thenCall(sfProjectId => {
      const parameters: QueryParameters = {
        [obj<NoteThread>().pathStr(t => t.projectRef)]: sfProjectId,
        [obj<NoteThread>().pathStr(t => t.biblicalTermId)]: { $ne: null }
      };
      return this.realtimeService.subscribeQuery(NoteThreadDoc.COLLECTION, parameters, noopDestroyRef);
    });
    when(mockedProjectService.getBiblicalTerm(anything(), anything())).thenCall((id, subscriber) =>
      this.realtimeService.subscribe(BiblicalTermDoc.COLLECTION, id, subscriber)
    );
    when(mockedProjectService.getNoteThread(anything(), anything())).thenCall((id, subscriber) =>
      this.realtimeService.subscribe(NoteThreadDoc.COLLECTION, id, subscriber)
    );
    when(mockedProjectService.getUserConfig(anything(), anything(), anything())).thenCall(
      (projectId, userId, subscriber) =>
        this.realtimeService.subscribe(
          SFProjectUserConfigDoc.COLLECTION,
          getSFProjectUserConfigDocId(projectId, userId),
          subscriber
        )
    );
    when(mockedProjectService.subscribeProfile(anything(), anything())).thenCall((sfProjectId, subscriber) =>
      this.realtimeService.get(SFProjectProfileDoc.COLLECTION, sfProjectId, subscriber)
    );
    when(mockedMatDialog.open(GenericDialogComponent, anything())).thenReturn(instance(this.mockedDialogRef));
    when(this.mockedDialogRef.afterClosed()).thenReturn(of());
    when(mockedMatDialog.openDialogs).thenCall(() => this.openNoteDialogs);
    this.testOnlineStatusService.setIsOnline(true);

    this.fixture = TestBed.createComponent(BiblicalTermsComponent);
    this.component = this.fixture.componentInstance;
    this.component.projectId = projectId;
    this.component.bookNum = bookNum;
    this.component.chapter = chapter;
    this.component.verse = verse;

    this.mockNoteDialogRef = new MockNoteDialogRef(this.fixture.nativeElement);
    when(mockedMatDialog.open(NoteDialogComponent, anything())).thenCall(() => {
      this.openNoteDialogs.push(this.mockNoteDialogRef);
      return this.mockNoteDialogRef;
    });
  }

  get biblicalTermsCategory(): NodeList {
    return this.fixture.nativeElement.querySelectorAll('td.mat-column-category');
  }

  get biblicalTermsTerm(): NodeList {
    return this.fixture.nativeElement.querySelectorAll('td.mat-column-term');
  }

  get biblicalTermsNotesButton(): HTMLElement {
    return this.fixture.nativeElement.querySelectorAll('td.mat-column-id button')[0] as HTMLElement;
  }

  get biblicalTermsNotesIcon(): HTMLElement {
    return this.fixture.nativeElement.querySelectorAll('td.mat-column-id mat-icon')[0] as HTMLElement;
  }

  get editBiblicalTermIcon(): HTMLElement {
    return this.fixture.nativeElement.querySelectorAll('td.mat-column-id mat-icon')[1] as HTMLElement;
  }

  get noDataRow(): NodeList {
    return this.fixture.nativeElement.querySelectorAll('.mat-mdc-no-data-row');
  }

  get notFoundMessage(): NodeList {
    return this.fixture.nativeElement.querySelectorAll('.not-found');
  }

  get offlineMessage(): NodeList {
    return this.fixture.nativeElement.querySelectorAll('.offline-message');
  }

  set onlineStatus(hasConnection: boolean) {
    this.testOnlineStatusService.setIsOnline(hasConnection);
    tick();
    this.fixture.detectChanges();
  }

  getBiblicalTermDoc(projectId: string, dataId: string): BiblicalTermDoc {
    return this.realtimeService.get(
      BiblicalTermDoc.COLLECTION,
      getBiblicalTermDocId(projectId, dataId),
      FETCH_WITHOUT_SUBSCRIBE
    );
  }

  getNoteThreadDoc(projectId: string, threadId: string): NoteThreadDoc {
    return this.realtimeService.get<NoteThreadDoc>(
      NoteThreadDoc.COLLECTION,
      getNoteThreadDocId(projectId, threadId),
      FETCH_WITHOUT_SUBSCRIBE
    );
  }

  getProjectUserConfigDoc(projectId: string, userId: string): SFProjectUserConfigDoc {
    const id: string = getSFProjectUserConfigDocId(projectId, userId);
    return this.realtimeService.get<SFProjectUserConfigDoc>(
      SFProjectUserConfigDoc.COLLECTION,
      id,
      FETCH_WITHOUT_SUBSCRIBE
    );
  }

  setLanguage(language: string): void {
    when(mockedI18nService.localeCode).thenReturn(language);
    this.locale$.next({ canonicalTag: language } as Locale);
  }

  setupProjectData(language: string, noteThreads: boolean = true): void {
    this.setLanguage(language);
    when(mockedUserService.currentUserId).thenReturn('user01');
    this.realtimeService.addSnapshot<BiblicalTerm>(BiblicalTermDoc.COLLECTION, {
      id: 'project01:dataId01',
      data: {
        projectRef: 'project01',
        ownerRef: 'user01',
        dataId: 'dataId01',
        termId: 'termId01',
        transliteration: 'transliteration01',
        renderings: ['rendering01'],
        description: 'description01',
        language: 'language01',
        links: ['link01'],
        references: [new VerseRef(1, 1, 1).BBBCCCVVV],
        definitions: {
          en: {
            categories: ['category01_en'],
            domains: ['domain01_en'],
            gloss: 'gloss01_en',
            notes: 'notes01_en'
          },
          es: {
            categories: [],
            domains: [],
            gloss: '',
            notes: ''
          },
          fr: {
            categories: ['category01_fr'],
            domains: ['domain01_fr'],
            gloss: 'gloss01_fr',
            notes: 'notes01_fr'
          }
        }
      }
    });
    this.realtimeService.addSnapshot<BiblicalTerm>(BiblicalTermDoc.COLLECTION, {
      id: 'project01:dataId02',
      data: {
        projectRef: 'project01',
        ownerRef: 'user02',
        dataId: 'dataId02',
        termId: 'termId02',
        transliteration: 'transliteration02',
        renderings: [],
        description: 'description02',
        language: 'language02',
        links: [],
        references: [new VerseRef(2, 2, 2).BBBCCCVVV],
        definitions: {}
      }
    });
    this.realtimeService.addSnapshot<BiblicalTerm>(BiblicalTermDoc.COLLECTION, {
      id: 'project02:dataId03',
      data: {
        projectRef: 'project02',
        ownerRef: 'user03',
        dataId: 'dataId03',
        termId: 'termId03',
        transliteration: 'transliteration03',
        renderings: ['rendering03'],
        description: 'description03',
        language: 'language03',
        links: ['link03'],
        references: [new VerseRef(3, 3, 3).BBBCCCVVV],
        definitions: {
          en: {
            categories: ['category03_en'],
            domains: ['domain03_en'],
            gloss: 'gloss03_en',
            notes: 'notes03_en'
          }
        }
      }
    });
    this.realtimeService.addSnapshot<BiblicalTerm>(BiblicalTermDoc.COLLECTION, {
      id: 'project01:dataId04',
      data: {
        projectRef: 'project01',
        ownerRef: 'user01',
        dataId: 'dataId04',
        termId: 'termId04',
        transliteration: 'transliteration04',
        renderings: ['rendering04'],
        description: 'description04',
        language: 'language04',
        links: ['link04'],
        references: [new VerseRef(1, 1, 2).BBBCCCVVV],
        definitions: {
          en: {
            categories: ['category04_en'],
            domains: ['domain04_en'],
            gloss: 'gloss04_en',
            notes: 'notes04_en'
          }
        }
      }
    });
    this.realtimeService.addSnapshot<BiblicalTerm>(BiblicalTermDoc.COLLECTION, {
      id: 'project01:dataId05',
      data: {
        projectRef: 'project01',
        ownerRef: 'user01',
        dataId: 'dataId05',
        termId: 'termId05',
        transliteration: 'transliteration05',
        renderings: ['rendering05'],
        description: 'description05',
        language: 'language05',
        links: ['link05'],
        references: [new VerseRef(1, 2, 1).BBBCCCVVV],
        definitions: {
          en: {
            categories: ['category05_en'],
            domains: ['domain05_en'],
            gloss: 'gloss05_en',
            notes: 'notes05_en'
          }
        }
      }
    });
    this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
      id: 'project01:user01',
      data: createTestProjectUserConfig({
        projectRef: 'project01',
        ownerRef: 'user01',
        translationSuggestionsEnabled: false,
        questionRefsRead: ['question01'],
        answerRefsRead: ['answer01'],
        commentRefsRead: ['comment01']
      })
    });
    this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
      id: 'project02:user01',
      data: createTestProjectUserConfig({
        projectRef: 'project02',
        ownerRef: 'user01',
        transliterateBiblicalTerms: true,
        translationSuggestionsEnabled: false,
        questionRefsRead: ['question01'],
        answerRefsRead: ['answer01'],
        commentRefsRead: ['comment01']
      })
    });
    if (noteThreads) {
      this.realtimeService.addSnapshot<NoteThread>(NoteThreadDoc.COLLECTION, {
        id: 'project01:threadId01',
        data: {
          projectRef: 'project01',
          dataId: 'threadId01',
          threadId: 'BT_termId01',
          verseRef: fromVerseRef(new VerseRef(1, 1, 1)),
          ownerRef: 'user01',
          originalContextBefore: '',
          originalContextAfter: '',
          originalSelectedText: '',
          notes: [this.getNewBiblicalTermNote('BT_termId01', 'note01', 'user01')],
          position: { start: 0, length: 0 },
          status: NoteStatus.Todo,
          assignment: '',
          publishedToSF: true,
          biblicalTermId: 'termId01'
        }
      });
      this.realtimeService.addSnapshot<NoteThread>(NoteThreadDoc.COLLECTION, {
        id: 'project02:threadId02',
        data: {
          projectRef: 'project02',
          dataId: 'threadId02',
          threadId: 'BT_termId03',
          verseRef: fromVerseRef(new VerseRef(1, 1, 1)),
          ownerRef: 'user02',
          originalContextBefore: '',
          originalContextAfter: '',
          originalSelectedText: '',
          notes: [this.getNewBiblicalTermNote('BT_termId03', 'note02', 'user02')],
          position: { start: 0, length: 0 },
          status: NoteStatus.Todo,
          assignment: '',
          publishedToSF: true,
          biblicalTermId: 'termId03'
        }
      });
    }
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project01',
      data: createTestProjectProfile({
        biblicalTermsConfig: {
          biblicalTermsEnabled: true,
          hasRenderings: false
        },
        userRoles: {
          user01: SFProjectRole.ParatextTranslator
        }
      })
    });
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project02',
      data: createTestProjectProfile({
        biblicalTermsConfig: {
          biblicalTermsEnabled: true,
          hasRenderings: false
        },
        userRoles: {
          user01: SFProjectRole.ParatextObserver
        }
      })
    });
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
    tick();
  }

  private getNewBiblicalTermNote(threadId: string, dataId: string, ownerRef: string): Note {
    return {
      dataId,
      threadId,
      dateCreated: '',
      dateModified: '',
      ownerRef,
      content: 'note content',
      type: NoteType.Normal,
      conflictType: NoteConflictType.DefaultValue,
      status: NoteStatus.Todo,
      deleted: false
    };
  }
}
