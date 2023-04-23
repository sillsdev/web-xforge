import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { anything, mock, when } from 'ts-mockito';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { BiblicalTerm } from 'realtime-server/lib/esm/scriptureforge/models/biblical-term';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { Note } from 'realtime-server/lib/esm/scriptureforge/models/note';
import {
  NoteConflictType,
  NoteStatus,
  NoteThread,
  NoteType
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { FeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
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
import { BiblicalTermsComponent, BiblicalTermNoteIcon, BiblicalTermDialogIcon } from './biblical-terms.component';

const mockedFeatureFlagService = mock(FeatureFlagService);
const mockedI18nService = mock(I18nService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);

describe('BiblicalTermsComponent', () => {
  configureTestingModule(() => ({
    imports: [NoopAnimationsModule, TestTranslocoModule, UICommonModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    declarations: [BiblicalTermsComponent],
    providers: [
      { provide: FeatureFlagService, useMock: mockedFeatureFlagService },
      { provide: I18nService, useMock: mockedI18nService },
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
    when(mockedFeatureFlagService.allowAddingNotes).thenReturn({ enabled: true } as FeatureFlag);
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

  it('should show none if no biblical terms notes and add disabled', fakeAsync(() => {
    const env = new TestEnvironment('project01', 2, 2, '2');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect(env.biblicalTermsNotesIcon.innerText).toBe(BiblicalTermNoteIcon.NoNotesIcon);
  }));

  it('should show unread biblical terms notes', fakeAsync(() => {
    const env = new TestEnvironment('project02', 3, 3);
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect(env.biblicalTermsNotesIcon.innerText).toBe(BiblicalTermNoteIcon.UnreadNotesIcon);
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
});

class TestEnvironment {
  readonly component: BiblicalTermsComponent;
  readonly fixture: ComponentFixture<BiblicalTermsComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

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
    when(mockedProjectService.queryNoteThreads(anything())).thenCall(sfProjectId => {
      const parameters: QueryParameters = {
        [obj<NoteThread>().pathStr(t => t.projectRef)]: sfProjectId
      };
      return this.realtimeService.subscribeQuery(NoteThreadDoc.COLLECTION, parameters);
    });
    when(mockedProjectService.getUserConfig(anything(), anything())).thenCall((sfProjectId, sfUserId) =>
      this.realtimeService.get(SFProjectUserConfigDoc.COLLECTION, `${sfProjectId}:${sfUserId}`)
    );
    when(mockedProjectService.getProfile(anything())).thenCall(sfProjectId =>
      this.realtimeService.get(SFProjectProfileDoc.COLLECTION, sfProjectId)
    );
    when(mockedFeatureFlagService.allowAddingNotes).thenReturn({ enabled: false } as FeatureFlag);

    this.fixture = TestBed.createComponent(BiblicalTermsComponent);
    this.component = this.fixture.componentInstance;
    this.component.configProjectId = configProjectId;
    this.component.projectId = projectId;
    this.component.bookNum = bookNum;
    this.component.chapter = chapter;
    this.component.verse = verse;
  }

  get biblicalTermsCategory(): NodeList {
    return this.fixture.nativeElement.querySelectorAll('td.mat-column-category');
  }

  get biblicalTermsTerm(): NodeList {
    return this.fixture.nativeElement.querySelectorAll('td.mat-column-term');
  }

  get biblicalTermsNotesIcon(): HTMLElement {
    return this.fixture.nativeElement.querySelectorAll('td.mat-column-id mat-icon')[0] as HTMLElement;
  }

  get editBiblicalTermIcon(): HTMLElement {
    return this.fixture.nativeElement.querySelectorAll('td.mat-column-id mat-icon')[1] as HTMLElement;
  }

  setupProjectData(language: string): void {
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedI18nService.localeCode).thenReturn(language);
    this.realtimeService.addSnapshot<BiblicalTerm>(BiblicalTermDoc.COLLECTION, {
      id: 'id01',
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
            gloss: 'gloss01_es',
            notes: 'notes01_es'
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
      id: 'id02',
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
      id: 'id03',
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
    this.realtimeService.addSnapshot<NoteThread>(NoteThreadDoc.COLLECTION, {
      id: `project01:BT_termId01`,
      data: {
        projectRef: 'project01',
        dataId: 'BT_termId01',
        verseRef: new VerseRef(1, 1, 1),
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
      id: `project02:BT_termId03`,
      data: {
        projectRef: 'project02',
        dataId: 'BT_termId03',
        verseRef: new VerseRef(1, 1, 1),
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
    this.realtimeService.addSnapshot<SFProject>(SFProjectProfileDoc.COLLECTION, {
      id: 'project01',
      data: {
        name: 'project01',
        paratextId: 'project01',
        shortName: 'project01',
        writingSystem: {
          tag: 'en'
        },
        translateConfig: {
          translationSuggestionsEnabled: false,
          shareEnabled: false
        },
        checkingConfig: {
          checkingEnabled: true,
          shareEnabled: true,
          usersSeeEachOthersResponses: true,
          answerExportMethod: CheckingAnswerExport.MarkedForExport
        },
        sync: { queuedCount: 0, lastSyncSuccessful: true },
        biblicalTermsEnabled: true,
        editable: true,
        userRoles: {
          ['user01']: SFProjectRole.ParatextTranslator
        },
        userPermissions: {},
        texts: [],
        noteTags: [],
        paratextUsers: []
      }
    });
    this.realtimeService.addSnapshot<SFProject>(SFProjectProfileDoc.COLLECTION, {
      id: 'project02',
      data: {
        name: 'project02',
        paratextId: 'project02',
        shortName: 'project02',
        writingSystem: {
          tag: 'en'
        },
        translateConfig: {
          translationSuggestionsEnabled: false,
          shareEnabled: false
        },
        checkingConfig: {
          checkingEnabled: true,
          shareEnabled: true,
          usersSeeEachOthersResponses: true,
          answerExportMethod: CheckingAnswerExport.MarkedForExport
        },
        sync: { queuedCount: 0, lastSyncSuccessful: true },
        biblicalTermsEnabled: true,
        editable: true,
        userRoles: {
          ['user01']: SFProjectRole.ParatextObserver
        },
        userPermissions: {},
        texts: [],
        noteTags: [],
        paratextUsers: []
      }
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
