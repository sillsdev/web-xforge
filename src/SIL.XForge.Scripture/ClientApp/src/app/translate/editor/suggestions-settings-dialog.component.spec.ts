import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web/dialog';
import { MdcSlider } from '@angular-mdc/web/slider';
import { OverlayContainer } from '@angular/cdk/overlay';
import { CommonModule } from '@angular/common';
import { Component, DebugElement, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import cloneDeep from 'lodash/cloneDeep';
import {
  getSFProjectUserConfigDocId,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { BehaviorSubject } from 'rxjs';
import { mock, when } from 'ts-mockito';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
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
    imports: [DialogTestModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
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
  }));

  it('update suggestions enabled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component!.translationSuggestionsUserEnabled).toBe(true);

    env.clickSwitch(env.mdcSuggestionsEnabledSwitch);
    expect(env.component!.translationSuggestionsUserEnabled).toBe(false);
    const userConfigDoc = env.getProjectUserConfigDoc();
    expect(userConfigDoc.data!.translationSuggestionsEnabled).toBe(false);
  }));

  it('update num suggestions', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component!.numSuggestions).toEqual('1');

    env.changeSelectValue(env.mdcNumSuggestionsSelect, 2);
    expect(env.component!.numSuggestions).toEqual('2');
    const userConfigDoc = env.getProjectUserConfigDoc();
    expect(userConfigDoc.data!.numSuggestions).toEqual(2);
  }));

  it('shows correct confidence threshold even when suggestions disabled', fakeAsync(() => {
    const env = new TestEnvironment(false);
    env.openDialog();
    expect(env.confidenceThresholdSlider.value).toEqual(50);
  }));

  it('disables settings when offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();

    expect(env.offlineText).toBeNull();
    expect(env.suggestionsEnabledSwitch.disabled).toBe(false);
    expect(env.confidenceThresholdSlider.disabled).toBe(false);
    expect(env.numSuggestionsSelect.disabled).toBe(false);

    env.isOnline = false;

    expect(env.offlineText).not.toBeNull();
    expect(env.suggestionsEnabledSwitch.disabled).toBe(true);
    expect(env.confidenceThresholdSlider.disabled).toBe(true);
    expect(env.numSuggestionsSelect.disabled).toBe(true);
  }));

  it('the suggestions toggle is switched on when the dialog opens while offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.isOnline = false;
    env.openDialog();

    expect(env.suggestionsEnabledSwitch.disabled).toBe(true);
    expect(env.suggestionsEnabledSwitch.checked).toBe(true);
  }));
});

@Directive({
  // ts lint complains that a directive should be used as an attribute
  // tslint:disable-next-line:directive-selector
  selector: 'viewContainerDirective'
})
class ViewContainerDirective {
  constructor(public viewContainerRef: ViewContainerRef) {}
}

@Component({
  selector: 'app-view-container',
  template: '<viewContainerDirective></viewContainerDirective>'
})
class ChildViewContainerComponent {
  @ViewChild(ViewContainerDirective, { static: true }) viewContainer!: ViewContainerDirective;

  get childViewContainer(): ViewContainerRef {
    return this.viewContainer.viewContainerRef;
  }
}

@NgModule({
  imports: [CommonModule, UICommonModule, TestTranslocoModule],
  declarations: [ViewContainerDirective, ChildViewContainerComponent, SuggestionsSettingsDialogComponent],
  exports: [ViewContainerDirective, ChildViewContainerComponent, SuggestionsSettingsDialogComponent],
  entryComponents: [ChildViewContainerComponent, SuggestionsSettingsDialogComponent]
})
class DialogTestModule {}

class TestEnvironment {
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  component?: SuggestionsSettingsDialogComponent;
  readonly overlayContainerElement: HTMLElement;
  onlineStatus: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);

  private readonly realtimeService: TestRealtimeService = TestBed.get<TestRealtimeService>(TestRealtimeService);

  constructor(translationSuggestionsEnabled = true) {
    this.setProjectUserConfig({
      confidenceThreshold: 0.5,
      translationSuggestionsEnabled,
      numSuggestions: 1
    });

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    this.overlayContainerElement = TestBed.get(OverlayContainer).getContainerElement();

    when(mockedPwaService.isOnline).thenCall(() => this.onlineStatus.getValue());
    when(mockedPwaService.onlineStatus).thenReturn(this.onlineStatus.asObservable());
  }

  get confidenceThresholdSlider(): MdcSlider {
    return this.component!.confidenceThresholdSlider!;
  }

  get mdcSuggestionsEnabledSwitch(): HTMLElement {
    return this.overlayContainerElement.querySelector('#suggestions-enabled-switch') as HTMLElement;
  }

  get suggestionsEnabledSwitch(): HTMLInputElement {
    return this.mdcSuggestionsEnabledSwitch.querySelector('input[type="checkbox"]') as HTMLInputElement;
  }

  get mdcNumSuggestionsSelect(): HTMLElement {
    return this.overlayContainerElement.querySelector('#num-suggestions-select') as HTMLElement;
  }

  get numSuggestionsSelect(): HTMLSelectElement {
    return this.mdcNumSuggestionsSelect.querySelector('select') as HTMLSelectElement;
  }

  get offlineText(): DebugElement {
    return this.fixture.debugElement.query(By.css('.offline-text'));
  }

  set isOnline(value: boolean) {
    this.onlineStatus.next(value);
    this.fixture.detectChanges();
    tick();
  }

  openDialog(): void {
    this.realtimeService
      .subscribe<SFProjectUserConfigDoc>(
        SF_PROJECT_USER_CONFIGS_COLLECTION,
        getSFProjectUserConfigDocId('project01', 'user01')
      )
      .then(projectUserConfigDoc => {
        const viewContainerRef = this.fixture.componentInstance.childViewContainer;
        const config: MdcDialogConfig<SuggestionsSettingsDialogData> = {
          data: { projectUserConfigDoc },
          viewContainerRef
        };
        const dialogRef = TestBed.get(MdcDialog).open(SuggestionsSettingsDialogComponent, config);
        this.component = dialogRef.componentInstance;
      });
    this.wait();
  }

  updateConfidenceThresholdSlider(value: number): void {
    this.confidenceThresholdSlider.value = value;
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

  clickSwitch(element: HTMLElement) {
    const inputElem = element.querySelector('input');
    inputElem!.click();
    this.fixture.detectChanges();
    tick();
  }

  changeSelectValue(element: HTMLElement, option: number): void {
    const selectElem = element.querySelector('select');
    selectElem!.value = option.toString();
    selectElem!.dispatchEvent(new Event('change'));
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
