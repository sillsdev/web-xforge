import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import {
  MatLegacyDialog as MatDialog,
  MatLegacyDialogConfig as MatDialogConfig,
  MatLegacyDialogRef as MatDialogRef
} from '@angular/material/legacy-dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { VerseRef } from '@sillsdev/scripture';
import { of } from 'rxjs';
import { anything, capture, instance, mock, verify, when } from 'ts-mockito';
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
import { fromVerseRef, VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { GenericDialogComponent, GenericDialogOptions } from 'xforge-common/generic-dialog/generic-dialog.component';
import { I18nService } from 'xforge-common/i18n.service';
import { QueryParameters } from 'xforge-common/query-parameters';
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
import { NoteDialogComponent } from '../editor/note-dialog/note-dialog.component';
import { MockNoteDialogRef } from '../editor/editor.component.spec';
import { BiblicalTermsComponent, BiblicalTermNoteIcon, BiblicalTermDialogIcon } from './biblical-terms.component';

const mockedI18nService = mock(I18nService);
const mockedMatDialog = mock(MatDialog);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);

describe('BiblicalTermsComponent', () => {
  configureTestingModule(() => ({
    imports: [NoopAnimationsModule, TestTranslocoModule, UICommonModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    declarations: [BiblicalTermsComponent],
    providers: [
      { provide: I18nService, useMock: mockedI18nService },
      { provide: MatDialog, useMock: mockedMatDialog },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService }
    ]
  }));

  it('should display biblical terms', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1);
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
  }));

  it('should display biblical terms in the specified language', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1);
    env.setupProjectData('fr');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_fr');
  }));

  it('should display biblical terms in the default language if the specified language does not exist', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1);
    env.setupProjectData('de');
    env.wait();
    expect(I18nService.defaultLocale.canonicalTag).toBe('en');
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
  }));

  it('should display biblical terms in the default language if the specified language has blank values', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1);
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

  it('should filter biblical terms by verse', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
  }));

  it('should exclude biblical terms not in the selected verse', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '2');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(0);
  }));

  it('should include biblical terms in verse ranges', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1-2');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
  }));

  it('should show biblical terms for partial verse', fakeAsync(() => {
    const env = new TestEnvironment('project01', 1, 1, '1a');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
  }));

  it('can use the user project configuration of a different project', fakeAsync(() => {
    const env = new TestEnvironment('project02', 3, 3, '0', 'project01');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId03');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category03_en');
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

  it('can save a new note thread for a biblical term', fakeAsync(() => {
    const projectId = 'project01';
    const env = new TestEnvironment(projectId, 2, 2, '2');
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
    expect(biblicalTermId.toString()).toEqual('dataId02');

    const biblicalTerm = env.getBiblicalTermDoc(projectId, biblicalTermId);
    const verseData: VerseRefData = fromVerseRef(new VerseRef(biblicalTerm.data!.references[0]));
    verify(mockedProjectService.createNoteThread(projectId, anything())).once();
    const [, noteThread] = capture(mockedProjectService.createNoteThread).last();
    expect(noteThread.verseRef).toEqual(verseData);
    expect(noteThread.originalSelectedText).toEqual('');
    expect(noteThread.publishedToSF).toBe(true);
    expect(noteThread.notes[0].ownerRef).toEqual('user01');
    expect(noteThread.notes[0].content).toEqual(noteContent);
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

    env.biblicalTermsNotesButton.click();
    env.wait();
    env.mockNoteDialogRef.close({ status: NoteStatus.Resolved });
    env.wait();

    verify(mockedMatDialog.open(NoteDialogComponent, anything())).once();
    const noteThread: NoteThread = env.getNoteThreadDoc(projectId, 'threadId01').data!;
    expect(noteThread.status).toEqual(NoteStatus.Resolved);
    expect(noteThread.notes[1].content).toBeUndefined();
  }));
});

class TestEnvironment {
  readonly component: BiblicalTermsComponent;
  readonly fixture: ComponentFixture<BiblicalTermsComponent>;
  readonly mockNoteDialogRef;
  readonly mockedDialogRef = mock<MatDialogRef<GenericDialogComponent<any>, GenericDialogOptions<any>>>(MatDialogRef);
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  private openNoteDialogs: MockNoteDialogRef[] = [];

  constructor(
    projectId: string,
    bookNum: number,
    chapter: number,
    verse: string = '0',
    configProjectId: string = projectId
  ) {
    when(mockedProjectService.queryBiblicalTerms(anything())).thenCall(sfProjectId => {
      const parameters: QueryParameters = {
        [obj<BiblicalTerm>().pathStr(t => t.projectRef)]: sfProjectId
      };
      return this.realtimeService.subscribeQuery(BiblicalTermDoc.COLLECTION, parameters);
    });
    when(mockedProjectService.queryBiblicalTermNoteThreads(anything())).thenCall(sfProjectId => {
      const parameters: QueryParameters = {
        [obj<NoteThread>().pathStr(t => t.projectRef)]: sfProjectId,
        [obj<NoteThread>().pathStr(t => t.biblicalTermId)]: { $ne: null }
      };
      return this.realtimeService.subscribeQuery(NoteThreadDoc.COLLECTION, parameters);
    });
    when(mockedProjectService.getBiblicalTerm(anything())).thenCall(id =>
      this.realtimeService.subscribe(BiblicalTermDoc.COLLECTION, id)
    );
    when(mockedProjectService.getNoteThread(anything())).thenCall(id =>
      this.realtimeService.subscribe(NoteThreadDoc.COLLECTION, id)
    );
    when(mockedProjectService.getUserConfig(anything(), anything())).thenCall((projectId, userId) =>
      this.realtimeService.get(SFProjectUserConfigDoc.COLLECTION, getSFProjectUserConfigDocId(projectId, userId))
    );
    when(mockedProjectService.getProfile(anything())).thenCall(sfProjectId =>
      this.realtimeService.get(SFProjectProfileDoc.COLLECTION, sfProjectId)
    );
    when(mockedMatDialog.open(GenericDialogComponent, anything())).thenReturn(instance(this.mockedDialogRef));
    when(this.mockedDialogRef.afterClosed()).thenReturn(of());
    when(mockedMatDialog.openDialogs).thenCall(() => this.openNoteDialogs);

    this.fixture = TestBed.createComponent(BiblicalTermsComponent);
    this.component = this.fixture.componentInstance;
    this.component.configProjectId = configProjectId;
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

  getBiblicalTermDoc(projectId: string, dataId: string): BiblicalTermDoc {
    return this.realtimeService.get(BiblicalTermDoc.COLLECTION, getBiblicalTermDocId(projectId, dataId));
  }

  getNoteThreadDoc(projectId: string, threadId: string): NoteThreadDoc {
    return this.realtimeService.get<NoteThreadDoc>(NoteThreadDoc.COLLECTION, getNoteThreadDocId(projectId, threadId));
  }

  getProjectUserConfigDoc(projectId: string, userId: string): SFProjectUserConfigDoc {
    const id: string = getSFProjectUserConfigDocId(projectId, userId);
    return this.realtimeService.get<SFProjectUserConfigDoc>(SFProjectUserConfigDoc.COLLECTION, id);
  }

  setupProjectData(language: string, noteThreads: boolean = true): void {
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedI18nService.localeCode).thenReturn(language);
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
    this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
      id: 'project01:user01',
      data: {
        projectRef: 'project01',
        ownerRef: 'user01',
        isTargetTextRight: false,
        confidenceThreshold: 0.2,
        biblicalTermsEnabled: true,
        transliterateBiblicalTerms: false,
        translationSuggestionsEnabled: false,
        numSuggestions: 1,
        selectedSegment: '',
        questionRefsRead: ['question01'],
        answerRefsRead: ['answer01'],
        commentRefsRead: ['comment01'],
        noteRefsRead: []
      }
    });
    this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
      id: 'project02:user01',
      data: {
        projectRef: 'project02',
        ownerRef: 'user01',
        isTargetTextRight: false,
        confidenceThreshold: 0.2,
        biblicalTermsEnabled: true,
        transliterateBiblicalTerms: true,
        translationSuggestionsEnabled: false,
        numSuggestions: 1,
        selectedSegment: '',
        questionRefsRead: ['question01'],
        answerRefsRead: ['answer01'],
        commentRefsRead: ['comment01'],
        noteRefsRead: []
      }
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
