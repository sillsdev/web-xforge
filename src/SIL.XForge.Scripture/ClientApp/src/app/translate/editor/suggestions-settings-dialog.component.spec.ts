import { CommonModule } from '@angular/common';
import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSelect } from '@angular/material/select';
import { MatSlider } from '@angular/material/slider';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import cloneDeep from 'lodash-es/cloneDeep';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig,
  SF_PROJECT_USER_CONFIGS_COLLECTION
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { BehaviorSubject } from 'rxjs';
import { mock, when } from 'ts-mockito';
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
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import {
  CONFIDENCE_THRESHOLD_TIMEOUT,
  SuggestionsSettingsDialogComponent,
  SuggestionsSettingsDialogData
} from './suggestions-settings-dialog.component';

const mockedPwaService = mock(PwaService);

describe('SuggestionsSettingsDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, NoopAnimationsModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [{ provide: PwaService, useMock: mockedPwaService }]
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

    env.clickSwitch(env.suggestionsEnabledSwitch);
    expect(env.component!.translationSuggestionsUserEnabled).toBe(false);
    const userConfigDoc = env.getProjectUserConfigDoc();
    expect(userConfigDoc.data!.translationSuggestionsEnabled).toBe(false);
    env.closeDialog();
  }));

  it('update num suggestions', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component!.numSuggestions).toEqual('1');

    env.changeSelectValue(env.numSuggestionsSelect, 2);
    expect(env.component!.numSuggestions).toEqual('2');
    const userConfigDoc = env.getProjectUserConfigDoc();
    expect(userConfigDoc.data!.numSuggestions).toEqual(2);
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
    expect(env.suggestionsEnabledCheckbox.disabled).toBe(false);
    expect(env.confidenceThresholdSlider.disabled).toBe(false);
    expect(env.numSuggestionsSelect.disabled).toBe(false);

    env.isOnline = false;

    expect(env.offlineText).not.toBeNull();
    expect(env.suggestionsEnabledCheckbox.disabled).toBe(true);
    expect(env.confidenceThresholdSlider.disabled).toBe(true);
    expect(env.numSuggestionsSelect.disabled).toBe(true);
    env.closeDialog();
  }));

  it('the suggestions toggle is switched on when the dialog opens while offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.isOnline = false;
    env.openDialog();

    expect(env.suggestionsEnabledCheckbox.disabled).toBe(true);
    expect(env.suggestionsEnabledCheckbox.checked).toBe(true);
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

  constructor(translationSuggestionsEnabled = true) {
    this.setProjectUserConfig({
      confidenceThreshold: 0.5,
      translationSuggestionsEnabled,
      numSuggestions: 1
    });

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);

    when(mockedPwaService.isOnline).thenCall(() => this.onlineStatus.getValue());
    when(mockedPwaService.onlineStatus$).thenReturn(this.onlineStatus.asObservable());
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get confidenceThresholdSlider(): MatSlider {
    return this.fixture.debugElement.query(By.css('#confidence-threshold-slider')).componentInstance;
  }

  get suggestionsEnabledSwitch(): HTMLElement {
    return this.overlayContainerElement.querySelector('#suggestions-enabled-switch') as HTMLElement;
  }

  get suggestionsEnabledCheckbox(): HTMLInputElement {
    return this.suggestionsEnabledSwitch.querySelector('input[type="checkbox"]') as HTMLInputElement;
  }

  get numSuggestionsSelect(): MatSelect {
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
    this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
      id: getSFProjectUserConfigDocId('project01', user1Config.ownerRef),
      data: user1Config
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

  changeSelectValue(matSelect: MatSelect, option: number): void {
    matSelect.value = option;
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
