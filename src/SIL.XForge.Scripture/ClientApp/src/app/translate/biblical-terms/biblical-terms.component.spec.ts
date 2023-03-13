import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { anything, mock, when } from 'ts-mockito';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { BiblicalTerm } from 'realtime-server/lib/esm/scriptureforge/models/biblical-term';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { BiblicalTermDoc } from 'src/app/core/models/biblical-term-doc';
import { I18nService } from 'xforge-common/i18n.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { BiblicalTermsComponent } from './biblical-terms.component';

const mockedI18nService = mock(I18nService);
const mockedProjectService = mock(SFProjectService);

describe('BiblicalTermsComponent', () => {
  configureTestingModule(() => ({
    imports: [NoopAnimationsModule, TestTranslocoModule, UICommonModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    declarations: [BiblicalTermsComponent],
    providers: [
      { provide: I18nService, useMock: mockedI18nService },
      { provide: SFProjectService, useMock: mockedProjectService }
    ]
  }));

  it('should display biblical terms', fakeAsync(() => {
    const env = new TestEnvironment(1, 1);
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
  }));

  it('should display biblical terms in the specified language', fakeAsync(() => {
    const env = new TestEnvironment(1, 1);
    env.setupProjectData('fr');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_fr');
  }));

  it('should display biblical terms in the default language if the specified language does not exist', fakeAsync(() => {
    const env = new TestEnvironment(1, 1);
    env.setupProjectData('de');
    env.wait();
    expect(I18nService.defaultLocale.canonicalTag).toBe('en');
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId01');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('category01_en');
  }));

  it('should display biblical terms with missing data', fakeAsync(() => {
    const env = new TestEnvironment(2, 2);
    env.setupProjectData('en');
    env.wait();
    expect(env.biblicalTermsTerm.length).toBe(1);
    expect((env.biblicalTermsTerm[0] as HTMLElement).innerText).toBe('termId02');
    expect((env.biblicalTermsCategory[0] as HTMLElement).innerText).toBe('');
  }));
});

class TestEnvironment {
  readonly component: BiblicalTermsComponent;
  readonly fixture: ComponentFixture<BiblicalTermsComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(bookNum: number, chapter: number) {
    when(mockedProjectService.queryBiblicalTerms(anything())).thenCall(sfProjectId => {
      const parameters: QueryParameters = {
        [obj<BiblicalTerm>().pathStr(t => t.projectRef)]: sfProjectId
      };
      return this.realtimeService.subscribeQuery(BiblicalTermDoc.COLLECTION, parameters);
    });

    this.fixture = TestBed.createComponent(BiblicalTermsComponent);
    this.component = this.fixture.componentInstance;
    this.component.projectId = 'project01';
    this.component.bookNum = bookNum;
    this.component.chapter = chapter;
  }

  get biblicalTermsCategory(): NodeList {
    return this.fixture.nativeElement.querySelectorAll('td.mat-column-category');
  }

  get biblicalTermsTerm(): NodeList {
    return this.fixture.nativeElement.querySelectorAll('td.mat-column-term');
  }

  setupProjectData(language: string): void {
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
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}
