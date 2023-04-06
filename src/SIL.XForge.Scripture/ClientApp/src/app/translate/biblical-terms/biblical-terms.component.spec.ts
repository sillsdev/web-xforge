import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { anything, mock, when } from 'ts-mockito';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { BiblicalTerm } from 'realtime-server/lib/esm/scriptureforge/models/biblical-term';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { I18nService } from 'xforge-common/i18n.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { BiblicalTermDoc } from '../../core/models/biblical-term-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { BiblicalTermsComponent } from './biblical-terms.component';

const mockedI18nService = mock(I18nService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);

describe('BiblicalTermsComponent', () => {
  configureTestingModule(() => ({
    imports: [NoopAnimationsModule, TestTranslocoModule, UICommonModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    declarations: [BiblicalTermsComponent],
    providers: [
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

  it('can use the user project configuration of a difference project', fakeAsync(() => {
    const env = new TestEnvironment('project02', 3, 3, '0', 'project01');
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId03');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category03_en');
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
    when(mockedProjectService.getUserConfig(anything(), anything())).thenCall((sfProjectId, sfUserId) =>
      this.realtimeService.get(SFProjectUserConfigDoc.COLLECTION, `${sfProjectId}:${sfUserId}`)
    );

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

  setupProjectData(language: string): void {
    when(mockedUserService.currentUserId).thenReturn('owner01');
    when(mockedI18nService.localeCode).thenReturn(language);
    this.realtimeService.addSnapshot<BiblicalTerm>(BiblicalTermDoc.COLLECTION, {
      id: 'id01',
      data: {
        projectRef: 'project01',
        ownerRef: 'owner01',
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
        ownerRef: 'owner02',
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
        ownerRef: 'owner03',
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
      id: 'project01:owner01',
      data: {
        projectRef: 'project01',
        ownerRef: 'owner01',
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
      id: 'project02:owner01',
      data: {
        projectRef: 'project02',
        ownerRef: 'owner01',
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
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}
