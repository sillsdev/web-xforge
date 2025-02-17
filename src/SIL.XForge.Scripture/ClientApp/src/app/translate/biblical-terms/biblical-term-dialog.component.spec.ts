import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { VerseRef } from '@sillsdev/scripture';
import cloneDeep from 'lodash-es/cloneDeep';
import { BiblicalTerm } from 'realtime-server/lib/esm/scriptureforge/models/biblical-term';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import {
  getSFProjectUserConfigDocId,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import {
  ChildViewContainerComponent,
  configureTestingModule,
  matDialogCloseDelay,
  TestTranslocoModule
} from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { BiblicalTermDoc } from '../../core/models/biblical-term-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { BiblicalTermDialogComponent, BiblicalTermDialogData } from './biblical-term-dialog.component';

const mockedI18nService = mock(I18nService);

describe('BiblicalTermDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, NoopAnimationsModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [{ provide: I18nService, useMock: mockedI18nService }]
  }));

  it('should display the biblical term', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData('en');
    env.wait();

    env.openDialog('id01');
    expect(env.definition).toBe('termId01 --- gloss01_en --- notes01_en');
    expect(env.renderings.value).toBe('rendering01');
    expect(env.description.value).toBe('description01');
    env.closeDialog();
  }));

  it('should display biblical term in the specified language', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData('fr');
    env.wait();

    env.openDialog('id01');
    expect(env.definition).toBe('termId01 --- gloss01_fr --- notes01_fr');
    expect(env.renderings.value).toBe('rendering01');
    expect(env.description.value).toBe('description01');
    env.closeDialog();
  }));

  it('should display the biblical term in the default language if the specified language does not exist', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData('de');
    env.wait();

    env.openDialog('id01');
    expect(I18nService.defaultLocale.canonicalTag).toBe('en');
    expect(env.definition).toBe('termId01 --- gloss01_en --- notes01_en');
    expect(env.renderings.value).toBe('rendering01');
    expect(env.description.value).toBe('description01');
    env.closeDialog();
  }));

  it('should display the biblical term in the default language if the specified language has blank values', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData('es');
    env.wait();

    env.openDialog('id01');
    expect(I18nService.defaultLocale.canonicalTag).toBe('en');
    expect(env.definition).toBe('termId01 --- gloss01_en --- notes01_en');
    expect(env.renderings.value).toBe('rendering01');
    expect(env.description.value).toBe('description01');
    env.closeDialog();
  }));

  it('should display a biblical term with missing data', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData('en');
    env.wait();

    env.openDialog('id02');
    expect(I18nService.defaultLocale.canonicalTag).toBe('en');
    expect(env.definition).toBe('termId02');
    expect(env.renderings.value).toBe('');
    expect(env.description.value).toBe('description02');
    env.closeDialog();
  }));

  it('should display transliterations when enabled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectUserConfig({ transliterateBiblicalTerms: true });
    env.setupProjectData('en');
    env.wait();

    env.openDialog('id01');
    expect(env.definition).toBe('transliteration01 --- gloss01_en --- notes01_en');
    expect(env.renderings.value).toBe('rendering01');
    expect(env.description.value).toBe('description01');
    env.closeDialog();
  }));

  it('should save changes to the biblical term', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData('en');
    env.wait();

    env.openDialog('id01');
    env.setTextFieldValue(env.renderings, 'updatedRendering \r\nsecondRendering\r\n\r\n\tthirdRendering\r\n');
    env.setTextFieldValue(env.description, 'updatedDescription');
    env.click(env.submitButton);
    env.wait();
    const biblicalTerm = env.getBiblicalTermDoc('id01');
    expect(biblicalTerm.data?.renderings).toEqual(['updatedRendering', 'secondRendering', 'thirdRendering']);
    expect(biblicalTerm.data?.description).toBe('updatedDescription');
  }));

  it('should remove empty lines from renderings', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData('en');
    env.wait();

    env.openDialog('id01');
    env.setTextFieldValue(env.renderings, '\r\n\r\n\r\n');
    env.setTextFieldValue(env.description, '');
    env.click(env.submitButton);
    env.wait();
    const biblicalTerm = env.getBiblicalTermDoc('id01');
    expect(biblicalTerm.data?.renderings).toEqual([]);
    expect(biblicalTerm.data?.description).toBe('');
  }));

  it('should be read only for users without write access', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectUserConfig({ transliterateBiblicalTerms: true, ownerRef: 'user02' });
    env.setupProjectData('en');
    env.wait();

    env.openDialog('id01', 'user02');
    expect(env.renderings.readOnly).toBe(true);
    expect(env.description.readOnly).toBe(true);
    expect(env.submitButton).toBeNull();
    env.closeDialog();
  }));
});

@NgModule({
  imports: [CommonModule, UICommonModule, TestTranslocoModule],
  declarations: [BiblicalTermDialogComponent],
  exports: [BiblicalTermDialogComponent]
})
class DialogTestModule {}

class TestEnvironment {
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  component?: BiblicalTermDialogComponent;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    this.setProjectUserConfig({
      confidenceThreshold: 0.5,
      translationSuggestionsEnabled: true,
      numSuggestions: 1,
      transliterateBiblicalTerms: false
    });

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get definition(): string | null {
    return this.overlayContainerElement.querySelector('#definition')?.textContent ?? null;
  }

  get renderings(): HTMLTextAreaElement {
    return this.overlayContainerElement.querySelector('#renderings') as HTMLTextAreaElement;
  }

  get description(): HTMLTextAreaElement {
    return this.overlayContainerElement.querySelector('#description') as HTMLTextAreaElement;
  }

  get closeButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('button[mat-dialog-close]') as HTMLElement;
  }

  get submitButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('button.save-button') as HTMLElement;
  }

  closeDialog(): void {
    this.click(this.closeButton);
    tick(matDialogCloseDelay);
  }

  getBiblicalTermDoc(id: string): BiblicalTermDoc {
    return this.realtimeService.get<BiblicalTermDoc>(BiblicalTermDoc.COLLECTION, id);
  }

  getProjectDoc(id: string): SFProjectProfileDoc {
    return this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, id);
  }

  openDialog(biblicalTermId: string, userId: string = 'user01'): void {
    this.realtimeService
      .subscribe<SFProjectUserConfigDoc>(
        SF_PROJECT_USER_CONFIGS_COLLECTION,
        getSFProjectUserConfigDocId('project01', userId)
      )
      .then(projectUserConfigDoc => {
        const biblicalTermDoc = this.getBiblicalTermDoc(biblicalTermId);
        const projectDoc = this.getProjectDoc('project01');
        const viewContainerRef = this.fixture.componentInstance.childViewContainer;
        const config: MatDialogConfig<BiblicalTermDialogData> = {
          data: { biblicalTermDoc, projectDoc, projectUserConfigDoc },
          viewContainerRef
        };
        const dialogRef = TestBed.inject(MatDialog).open(BiblicalTermDialogComponent, config);
        this.component = dialogRef.componentInstance;
      });
    this.wait();
  }

  setProjectUserConfig(userConfig: Partial<SFProjectUserConfig> = {}): void {
    const user1Config = cloneDeep(userConfig) as SFProjectUserConfig;
    if (user1Config.ownerRef == null) user1Config.ownerRef = 'user01';
    user1Config.projectRef = 'project01';
    this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
      id: getSFProjectUserConfigDocId(user1Config.projectRef, user1Config.ownerRef),
      data: user1Config
    });
  }

  setTextFieldValue(textField: HTMLTextAreaElement, value: string): void {
    textField.value = value;
    textField.dispatchEvent(new Event('input'));
    textField.dispatchEvent(new Event('change'));
    this.wait();
  }

  setupProjectData(language: string): void {
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
      id: 'id02',
      data: {
        projectRef: 'project01',
        ownerRef: 'user01',
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
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project01',
      data: createTestProjectProfile({
        biblicalTermsConfig: {
          biblicalTermsEnabled: true,
          hasRenderings: false
        },
        userRoles: {
          ['user01']: SFProjectRole.ParatextTranslator,
          ['user02']: SFProjectRole.ParatextObserver
        }
      })
    });
  }

  click(element: HTMLElement): void {
    element.click();
    flush();
    this.fixture.detectChanges();
    tick();
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
    // open dialog animation
    tick(166);
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}
