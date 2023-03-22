import { MdcSelect } from '@angular-mdc/web';
import { CommonModule } from '@angular/common';
import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSlider } from '@angular/material/slider';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import cloneDeep from 'lodash-es/cloneDeep';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig,
  SF_PROJECT_USER_CONFIGS_COLLECTION
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { BehaviorSubject } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import {
  ChildViewContainerComponent,
  configureTestingModule,
  matDialogCloseDelay,
  TestTranslocoModule
} from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import {
  CONFIDENCE_THRESHOLD_TIMEOUT,
  SuggestionsSettingsDialogComponent,
  SuggestionsSettingsDialogData
} from './suggestions-settings-dialog.component';

const mockedPwaService = mock(PwaService);
const mockedProjectService = mock(SFProjectService);

describe('SuggestionsSettingsDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, NoopAnimationsModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: PwaService, useMock: mockedPwaService }
    ]
  }));

  it('update confidence threshold', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component!.confidenceThreshold).toEqual(50);

    env.updateConfidenceThresholdSlider(60);
    expect(env.component!.confidenceThreshold).toEqual(60);
    const userConfigDoc = env.getProjectUserConfigDoc();
    expect(userConfigDoc.data!.confidenceThreshold).toEqual(0.6);
    env.closeDialog();
  }));

  it('update suggestions enabled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component!.translationSuggestionsUserEnabled).toBe(true);

    env.clickSwitch(env.mdcSuggestionsEnabledSwitch);
    expect(env.component!.translationSuggestionsUserEnabled).toBe(false);
    const userConfigDoc = env.getProjectUserConfigDoc();
    expect(userConfigDoc.data!.translationSuggestionsEnabled).toBe(false);
    env.closeDialog();
  }));

  it('update num suggestions', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component!.numSuggestions).toEqual('1');

    env.changeSelectValue(env.mdcNumSuggestionsSelect, 2);
    expect(env.component!.numSuggestions).toEqual('2');
    const userConfigDoc = env.getProjectUserConfigDoc();
    expect(userConfigDoc.data!.numSuggestions).toEqual(2);
    env.closeDialog();
  }));

  it('update biblical terms enabled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component!.biblicalTermsEnabled).toBe(true);

    env.clickSwitch(env.mdcBiblicalTermsEnabledSwitch);
    expect(env.component!.biblicalTermsEnabled).toBe(false);
    const userConfigDoc = env.getProjectUserConfigDoc();
    expect(userConfigDoc.data!.biblicalTermsEnabled).toBe(false);
    env.closeDialog();
  }));

  it('update transliterate biblical terms', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component!.transliterateBiblicalTerms).toBe(false);

    env.clickSwitch(env.mdcTransliterateBiblicalTermsSwitch);
    expect(env.component!.transliterateBiblicalTerms).toBe(true);
    const userConfigDoc = env.getProjectUserConfigDoc();
    expect(userConfigDoc.data!.transliterateBiblicalTerms).toBe(true);
    env.closeDialog();
  }));

  it('biblical terms is disabled if it is disabled in the project', fakeAsync(() => {
    const env = new TestEnvironment(true, false);
    env.openDialog();
    expect(env.component!.biblicalTermsEnabled).toBe(false);

    expect(env.biblicalTermsEnabledSwitch.disabled).toBe(true);
    env.closeDialog();
  }));

  it('transliterate biblical terms is disabled if biblical terms is disabled', fakeAsync(() => {
    const env = new TestEnvironment(true, true);
    env.openDialog();
    expect(env.component!.biblicalTermsEnabled).toBe(true);
    expect(env.transliterateBiblicalTermsSwitch.disabled).toBe(false);

    env.clickSwitch(env.mdcBiblicalTermsEnabledSwitch);
    expect(env.component!.biblicalTermsEnabled).toBe(false);
    expect(env.transliterateBiblicalTermsSwitch.disabled).toBe(true);
    env.closeDialog();
  }));

  it('the transliterate biblical terms toggle stays on when biblical terms is off', fakeAsync(() => {
    const env = new TestEnvironment(true, true);
    env.openDialog();
    expect(env.component!.biblicalTermsEnabled).toBe(true);
    expect(env.component!.transliterateBiblicalTerms).toBe(false);

    env.clickSwitch(env.mdcTransliterateBiblicalTermsSwitch);
    env.clickSwitch(env.mdcBiblicalTermsEnabledSwitch);

    expect(env.component!.transliterateBiblicalTerms).toBe(true);
    expect(env.transliterateBiblicalTermsSwitch.disabled).toBe(true);
    expect(env.transliterateBiblicalTermsSwitch.checked).toBe(true);
    env.closeDialog();
  }));

  it('shows correct confidence threshold even when suggestions disabled', fakeAsync(() => {
    const env = new TestEnvironment(false);
    env.openDialog();
    expect(env.confidenceThresholdSlider.value).toEqual(50);
    env.closeDialog();
  }));

  it('disables settings when offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();

    expect(env.offlineText).toBeNull();
    expect(env.suggestionsEnabledSwitch.disabled).toBe(false);
    expect(env.confidenceThresholdSlider.disabled).toBe(false);
    expect(env.mdcNumSuggestionsSelect.disabled).toBe(false);

    env.isOnline = false;

    expect(env.offlineText).not.toBeNull();
    expect(env.suggestionsEnabledSwitch.disabled).toBe(true);
    expect(env.confidenceThresholdSlider.disabled).toBe(true);
    expect(env.mdcNumSuggestionsSelect.disabled).toBe(true);
    env.closeDialog();
  }));

  it('the suggestions toggle is switched on when the dialog opens while offline', fakeAsync(() => {
    const env = new TestEnvironment(true);
    env.isOnline = false;
    env.openDialog();

    expect(env.suggestionsEnabledSwitch.disabled).toBe(true);
    expect(env.suggestionsEnabledSwitch.checked).toBe(true);
    env.closeDialog();
  }));
});

@NgModule({
  imports: [CommonModule, UICommonModule, TestTranslocoModule],
  declarations: [SuggestionsSettingsDialogComponent],
  exports: [SuggestionsSettingsDialogComponent]
})
class DialogTestModule {}

class TestEnvironment {
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  component?: SuggestionsSettingsDialogComponent;
  onlineStatus: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(translationSuggestionsEnabled = true, biblicalTermsEnabled = true) {
    this.setProjectUserConfig({
      confidenceThreshold: 0.5,
      translationSuggestionsEnabled,
      numSuggestions: 1,
      biblicalTermsEnabled,
      transliterateBiblicalTerms: false
    });

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);

    when(mockedProjectService.get(anything())).thenCall(sfProjectId =>
      this.realtimeService.get(SFProjectDoc.COLLECTION, sfProjectId)
    );

    when(mockedPwaService.isOnline).thenCall(() => this.onlineStatus.getValue());
    when(mockedPwaService.onlineStatus$).thenReturn(this.onlineStatus.asObservable());
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get confidenceThresholdSlider(): MatSlider {
    return this.component!.confidenceThresholdSlider!;
  }

  get mdcBiblicalTermsEnabledSwitch(): HTMLElement {
    return this.overlayContainerElement.querySelector('#biblical-terms-enabled-switch') as HTMLElement;
  }

  get biblicalTermsEnabledSwitch(): HTMLInputElement {
    return this.mdcBiblicalTermsEnabledSwitch.querySelector('input[type="checkbox"]') as HTMLInputElement;
  }

  get mdcTransliterateBiblicalTermsSwitch(): HTMLElement {
    return this.overlayContainerElement.querySelector('#transliterate-biblical-terms-switch') as HTMLElement;
  }

  get transliterateBiblicalTermsSwitch(): HTMLInputElement {
    return this.mdcTransliterateBiblicalTermsSwitch.querySelector('input[type="checkbox"]') as HTMLInputElement;
  }

  get mdcSuggestionsEnabledSwitch(): HTMLElement {
    return this.overlayContainerElement.querySelector('#suggestions-enabled-switch') as HTMLElement;
  }

  get suggestionsEnabledSwitch(): HTMLInputElement {
    return this.mdcSuggestionsEnabledSwitch.querySelector('input[type="checkbox"]') as HTMLInputElement;
  }

  get mdcNumSuggestionsSelect(): MdcSelect {
    return this.fixture.debugElement.query(By.css('#num-suggestions-select')).componentInstance;
  }

  get offlineText(): DebugElement {
    return this.fixture.debugElement.query(By.css('.offline-text'));
  }

  get closeButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('button[mat-dialog-close]') as HTMLElement;
  }

  set isOnline(value: boolean) {
    this.onlineStatus.next(value);
    this.fixture.detectChanges();
    tick();
  }

  closeDialog(): void {
    this.click(this.closeButton);
    tick(matDialogCloseDelay);
  }

  openDialog(): void {
    this.realtimeService
      .subscribe<SFProjectUserConfigDoc>(
        SF_PROJECT_USER_CONFIGS_COLLECTION,
        getSFProjectUserConfigDocId('project01', 'user01')
      )
      .then(projectUserConfigDoc => {
        const viewContainerRef = this.fixture.componentInstance.childViewContainer;
        const config: MatDialogConfig<SuggestionsSettingsDialogData> = {
          data: { projectUserConfigDoc },
          viewContainerRef
        };
        const dialogRef = TestBed.inject(MatDialog).open(SuggestionsSettingsDialogComponent, config);
        this.component = dialogRef.componentInstance;
      });
    this.wait();
  }

  updateConfidenceThresholdSlider(value: number): void {
    this.component!.confidenceThreshold = value;
    tick(CONFIDENCE_THRESHOLD_TIMEOUT);
    this.fixture.detectChanges();
  }

  setProjectUserConfig(userConfig: Partial<SFProjectUserConfig> = {}): void {
    const user1Config = cloneDeep(userConfig) as SFProjectUserConfig;
    user1Config.ownerRef = 'user01';
    user1Config.projectRef = 'project01';
    this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
      id: getSFProjectUserConfigDocId(user1Config.projectRef, user1Config.ownerRef),
      data: user1Config
    });
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: user1Config.projectRef,
      data: {
        name: 'Project 01',
        shortName: 'PT01',
        paratextId: 'pt01',
        writingSystem: { tag: 'qaa' },
        translateConfig: {
          translationSuggestionsEnabled: user1Config.translationSuggestionsEnabled,
          shareEnabled: true
        },
        checkingConfig: {
          checkingEnabled: false,
          usersSeeEachOthersResponses: true,
          shareEnabled: true,
          answerExportMethod: CheckingAnswerExport.MarkedForExport
        },
        texts: [],
        noteTags: [],
        biblicalTermsEnabled: user1Config.biblicalTermsEnabled,
        editable: true,
        sync: { queuedCount: 0 },
        userRoles: {},
        userPermissions: {},
        paratextUsers: []
      }
    });
  }

  getProjectUserConfigDoc(): SFProjectUserConfigDoc {
    return this.realtimeService.get<SFProjectUserConfigDoc>(
      SFProjectUserConfigDoc.COLLECTION,
      getSFProjectUserConfigDocId('project01', 'user01')
    );
  }

  clickSwitch(element: HTMLElement): void {
    const inputElem = element.querySelector('input')!;
    this.click(inputElem);
  }

  click(element: HTMLElement): void {
    element.click();
    flush();
    this.fixture.detectChanges();
    tick();
  }

  changeSelectValue(mdcSelect: MdcSelect, option: number): void {
    mdcSelect.setSelectionByValue(option.toString());
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
