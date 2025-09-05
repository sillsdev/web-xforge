import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSelect } from '@angular/material/select';
import { MatSlideToggleHarness } from '@angular/material/slide-toggle/testing';
import { MatSlider } from '@angular/material/slider';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import {
  getSFProjectUserConfigDocId,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { createTestProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config-test-data';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import {
  ChildViewContainerComponent,
  configureTestingModule,
  matDialogCloseDelay,
  TestTranslocoModule
} from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { NoticeComponent } from '../../shared/notice/notice.component';
import {
  CONFIDENCE_THRESHOLD_TIMEOUT,
  TranslatorSettingsDialogComponent,
  TranslatorSettingsDialogData
} from './translator-settings-dialog.component';

describe('TranslatorSettingsDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [
      DialogTestModule,
      NoopAnimationsModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [{ provide: OnlineStatusService, useClass: TestOnlineStatusService }]
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

  it('update suggestions enabled', fakeAsync(async () => {
    const env = new TestEnvironment();
    env.openDialog();
    expect(env.component!.translationSuggestionsUserEnabled).toBe(true);

    const suggestionsToggle = await env.getSuggestionsEnabledToggle();
    expect(suggestionsToggle).not.toBeNull();
    expect(await env.isToggleChecked(suggestionsToggle!)).toBe(true);

    await env.toggleSlideToggle(suggestionsToggle!);
    expect(env.component!.translationSuggestionsUserEnabled).toBe(false);
    expect(await env.isToggleChecked(suggestionsToggle!)).toBe(false);

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
    const env = new TestEnvironment({ translationSuggestionsEnabled: false });
    env.openDialog();
    expect(env.component?.confidenceThreshold).toEqual(50);
    env.closeDialog();
  }));

  it('disables settings when offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.openDialog();

    expect(env.offlineAppNotice == null).toBeTrue();
    expect(env.suggestionsEnabledCheckbox.disabled).toBe(false);
    expect(env.confidenceThresholdSlider.disabled).toBe(false);
    expect(env.numSuggestionsSelect.disabled).toBe(false);

    env.isOnline = false;

    expect(env.offlineAppNotice == null).toBeFalse();
    expect(env.suggestionsEnabledCheckbox.disabled).toBe(true);
    expect(env.confidenceThresholdSlider.disabled).toBe(true);
    expect(env.numSuggestionsSelect.disabled).toBe(true);
    env.closeDialog();
  }));

  it('should hide translation suggestions section when project has translation suggestions disabled', fakeAsync(async () => {
    const env = new TestEnvironment();
    const projectDoc = env.getProjectProfileDoc();

    env.setupProject({
      userConfig: {
        translationSuggestionsEnabled: true
      }
    });
    projectDoc.submitJson0Op(op => {
      op.set(p => p.translateConfig!.translationSuggestionsEnabled, false);
    });
    env.fixture.detectChanges();

    env.openDialog();

    expect(env.component!.showSuggestionsSettings).toBe(false);
    expect(env.suggestionsSection == null).toBeTrue();
    env.closeDialog();
  }));

  it('should show translation suggestions section when project has translation suggestions enabled', fakeAsync(async () => {
    const env = new TestEnvironment();
    env.openDialog();

    expect(env.component!.showSuggestionsSettings).toBe(true);
    expect(env.suggestionsSection == null).toBeFalse();
    env.closeDialog();
  }));

  it('the suggestions toggle is switched on when the dialog opens while offline', fakeAsync(async () => {
    const env = new TestEnvironment();
    env.isOnline = false;
    env.openDialog();

    const suggestionsToggle = await env.getSuggestionsEnabledToggle();
    expect(await env.isToggleDisabled(suggestionsToggle!)).toBe(true);
    expect(await env.isToggleChecked(suggestionsToggle!)).toBe(true);
    env.closeDialog();
  }));

  describe('Lynx Settings', () => {
    it('should show Lynx settings when both project features are enabled', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({
        projectConfig: {
          lynxConfig: {
            autoCorrectionsEnabled: true,
            assessmentsEnabled: true,
            punctuationCheckerEnabled: false,
            allowedCharacterCheckerEnabled: false
          }
        }
      });
      env.openDialog();

      expect(env.lynxSettingsSection == null).toBeFalse();
      expect(env.lynxMasterSwitch == null).toBeFalse();
      expect(env.lynxAssessmentsSwitch == null).toBeFalse();
      expect(env.lynxAutoCorrectSwitch == null).toBeFalse();
      env.closeDialog();
    }));

    it('should hide Lynx settings when project features are disabled', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({
        projectConfig: {
          lynxConfig: {
            autoCorrectionsEnabled: false,
            assessmentsEnabled: false,
            punctuationCheckerEnabled: false,
            allowedCharacterCheckerEnabled: false
          }
        }
      });
      env.openDialog();

      expect(env.lynxSettingsSection == null).toBeTrue();
      env.closeDialog();
    }));

    it('should show only assessments switch when only assessments is enabled in project', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({
        projectConfig: {
          lynxConfig: {
            autoCorrectionsEnabled: false,
            assessmentsEnabled: true,
            punctuationCheckerEnabled: false,
            allowedCharacterCheckerEnabled: false
          }
        }
      });
      env.openDialog();

      expect(env.lynxSettingsSection == null).toBeFalse();
      expect(env.lynxMasterSwitch == null).toBeFalse();
      expect(env.lynxAssessmentsSwitch == null).toBeFalse();
      expect(env.lynxAutoCorrectSwitch == null).toBeFalse;
      env.closeDialog();
    }));

    it('should show only auto-correct switch when only auto-correct is enabled in project', fakeAsync(() => {
      const env = new TestEnvironment();
      env.setupProject({
        projectConfig: {
          lynxConfig: {
            autoCorrectionsEnabled: true,
            assessmentsEnabled: false,
            punctuationCheckerEnabled: false,
            allowedCharacterCheckerEnabled: false
          }
        }
      });
      env.openDialog();

      expect(env.lynxSettingsSection == null).toBeFalse();
      expect(env.lynxMasterSwitch == null).toBeFalse();
      expect(env.lynxAssessmentsSwitch == null).toBeFalse;
      expect(env.lynxAutoCorrectSwitch == null).toBeFalse();
      env.closeDialog();
    }));

    it('should update user lynx master setting when toggled', fakeAsync(async () => {
      const env = new TestEnvironment();
      env.setupProject({
        projectConfig: {
          lynxConfig: {
            autoCorrectionsEnabled: true,
            assessmentsEnabled: true,
            punctuationCheckerEnabled: false,
            allowedCharacterCheckerEnabled: false
          }
        }
      });
      env.openDialog();

      const lynxMasterToggle = await env.getLynxMasterToggle();
      expect(lynxMasterToggle).not.toBeNull();
      expect(env.component!.lynxMasterSwitch.value).toBe(false);
      expect(await env.isToggleChecked(lynxMasterToggle!)).toBe(false);

      await env.toggleSlideToggle(lynxMasterToggle!);
      expect(env.component!.lynxMasterSwitch.value).toBe(true);
      expect(await env.isToggleChecked(lynxMasterToggle!)).toBe(true);

      const userConfigDoc = env.getProjectUserConfigDoc();
      expect(userConfigDoc.data!.lynxUserConfig?.autoCorrectionsEnabled).toBe(true);
      expect(userConfigDoc.data!.lynxUserConfig?.assessmentsEnabled).toBe(true);
      env.closeDialog();
    }));

    it('should update user lynx assessments setting when toggled', fakeAsync(async () => {
      const env = new TestEnvironment();
      env.setupProject({
        projectConfig: {
          lynxConfig: {
            autoCorrectionsEnabled: true,
            assessmentsEnabled: true,
            punctuationCheckerEnabled: false,
            allowedCharacterCheckerEnabled: false
          }
        }
      });
      env.openDialog();

      const lynxAssessmentsToggle = await env.getLynxAssessmentsToggle();
      expect(env.component!.lynxAssessmentsEnabled.value).toBe(false);
      expect(await env.isToggleChecked(lynxAssessmentsToggle!)).toBe(false);

      await env.toggleSlideToggle(lynxAssessmentsToggle!);
      expect(env.component!.lynxAssessmentsEnabled.value).toBe(true);
      expect(await env.isToggleChecked(lynxAssessmentsToggle!)).toBe(true);

      const userConfigDoc = env.getProjectUserConfigDoc();
      expect(userConfigDoc.data!.lynxUserConfig?.assessmentsEnabled).toBe(true);
      env.closeDialog();
    }));

    it('should enable Lynx settings even when offline', fakeAsync(async () => {
      const env = new TestEnvironment();
      env.setupProject({
        projectConfig: {
          lynxConfig: {
            autoCorrectionsEnabled: true,
            assessmentsEnabled: true,
            punctuationCheckerEnabled: false,
            allowedCharacterCheckerEnabled: false
          }
        }
      });
      env.isOnline = false;
      env.openDialog();

      const lynxMasterToggle = await env.getLynxMasterToggle();
      const lynxAssessmentsToggle = await env.getLynxAssessmentsToggle();
      const lynxAutoCorrectToggle = await env.getLynxAutoCorrectToggle();
      const suggestionsToggle = await env.getSuggestionsEnabledToggle();

      expect(lynxMasterToggle).not.toBeNull();
      expect(lynxAssessmentsToggle).not.toBeNull();
      expect(lynxAutoCorrectToggle).not.toBeNull();
      expect(suggestionsToggle).not.toBeNull();

      expect(await env.isToggleDisabled(lynxMasterToggle!)).toBe(false);
      expect(await env.isToggleDisabled(lynxAssessmentsToggle!)).toBe(false);
      expect(await env.isToggleDisabled(lynxAutoCorrectToggle!)).toBe(false);

      // But translation suggestions should be disabled
      expect(await env.isToggleDisabled(suggestionsToggle!)).toBe(true);
      env.closeDialog();
    }));
  });
});

@NgModule({
  imports: [UICommonModule, TestTranslocoModule, NoticeComponent],
  declarations: [TranslatorSettingsDialogComponent]
})
class DialogTestModule {}

interface TestEnvironmentConstructorArgs {
  translationSuggestionsEnabled?: boolean;
}

class TestEnvironment {
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  component?: TranslatorSettingsDialogComponent;
  loader?: HarnessLoader;
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor({ translationSuggestionsEnabled = true }: TestEnvironmentConstructorArgs = {}) {
    this.setProjectUserConfig({
      confidenceThreshold: 0.5,
      translationSuggestionsEnabled,
      numSuggestions: 1
    });

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get confidenceThresholdSlider(): MatSlider {
    return this.fixture.debugElement.query(By.css('#confidence-threshold-slider')).componentInstance;
  }

  get suggestionsEnabledSwitch(): HTMLElement {
    return this.overlayContainerElement.querySelector('#translation-suggestions-master-switch') as HTMLElement;
  }

  get suggestionsEnabledCheckbox(): HTMLInputElement {
    return this.suggestionsEnabledSwitch.querySelector('button[role=switch]') as HTMLInputElement;
  }

  get numSuggestionsSelect(): MatSelect {
    return this.fixture.debugElement.query(By.css('#num-suggestions-select')).componentInstance;
  }

  get offlineAppNotice(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-notice[icon="cloud_off"]'));
  }

  get closeButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('button[mat-dialog-close]') as HTMLElement;
  }

  get suggestionsSection(): HTMLElement | null {
    // Look for the card containing the translation suggestions master switch
    const suggestionsCard = this.overlayContainerElement
      .querySelector('#translation-suggestions-master-switch')
      ?.closest('mat-card');
    return suggestionsCard as HTMLElement | null;
  }

  get lynxSettingsSection(): HTMLElement | null {
    // Look for the card containing the lynx master switch
    const lynxCard = this.overlayContainerElement.querySelector('#lynx-master-switch')?.closest('mat-card');
    return lynxCard as HTMLElement | null;
  }

  get lynxMasterSwitch(): HTMLElement | null {
    return this.overlayContainerElement.querySelector('#lynx-master-switch') as HTMLElement | null;
  }

  get lynxAssessmentsSwitch(): HTMLElement | null {
    return this.overlayContainerElement.querySelector('#lynx-assessments-enabled') as HTMLElement | null;
  }

  get lynxAutoCorrectSwitch(): HTMLElement | null {
    return this.overlayContainerElement.querySelector('#lynx-autocorrect-enabled') as HTMLElement | null;
  }

  set isOnline(value: boolean) {
    this.testOnlineStatusService.setIsOnline(value);
    this.wait();
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
        const projectDoc = this.getProjectProfileDoc();
        const config: MatDialogConfig<TranslatorSettingsDialogData> = {
          data: { projectDoc, projectUserConfigDoc },
          viewContainerRef
        };
        const dialogRef = TestBed.inject(MatDialog).open(TranslatorSettingsDialogComponent, config);
        this.component = dialogRef.componentInstance;
        this.loader = TestbedHarnessEnvironment.documentRootLoader(this.fixture);
      });
    this.wait();
  }

  updateConfidenceThresholdSlider(value: number): void {
    this.component!.confidenceThreshold = value;
    tick(CONFIDENCE_THRESHOLD_TIMEOUT);
    this.fixture.detectChanges();
  }

  setProjectUserConfig(userConfig: Partial<SFProjectUserConfig> = {}): void {
    const user1Config = createTestProjectUserConfig({
      ownerRef: 'user01',
      ...userConfig
    });
    this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
      id: getSFProjectUserConfigDocId('project01', user1Config.ownerRef),
      data: user1Config
    });
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project01',
      data: createTestProjectProfile({
        translateConfig: {
          translationSuggestionsEnabled: user1Config.translationSuggestionsEnabled
        },
        userRoles: { user01: SFProjectRole.ParatextTranslator }
      })
    });
  }

  setupProject({
    userConfig = {},
    projectConfig = {}
  }: {
    userConfig?: Partial<SFProjectUserConfig>;
    projectConfig?: Partial<SFProjectProfile>;
  } = {}): void {
    const user1Config: SFProjectUserConfig = createTestProjectUserConfig({
      ownerRef: 'user01',
      confidenceThreshold: 0.5,
      ...userConfig
    });

    this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
      id: getSFProjectUserConfigDocId('project01', user1Config.ownerRef),
      data: user1Config
    });

    const projectProfile = {
      ...createTestProjectProfile({
        translateConfig: {
          translationSuggestionsEnabled: user1Config.translationSuggestionsEnabled
        },
        userRoles: { user01: SFProjectRole.ParatextTranslator }
      }),
      ...projectConfig
    };

    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project01',
      data: projectProfile
    });
  }

  getProjectProfileDoc(): SFProjectProfileDoc {
    return this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, 'project01');
  }

  getProjectUserConfigDoc(): SFProjectUserConfigDoc {
    return this.realtimeService.get<SFProjectUserConfigDoc>(
      SFProjectUserConfigDoc.COLLECTION,
      getSFProjectUserConfigDocId('project01', 'user01')
    );
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

  async getSuggestionsEnabledToggle(): Promise<MatSlideToggleHarness | null> {
    if (!this.loader) return null;
    return await this.loader.getHarnessOrNull(
      MatSlideToggleHarness.with({ selector: '#translation-suggestions-master-switch' })
    );
  }

  async getLynxMasterToggle(): Promise<MatSlideToggleHarness | null> {
    if (!this.loader) return null;
    return await this.loader.getHarnessOrNull(MatSlideToggleHarness.with({ selector: '#lynx-master-switch' }));
  }

  async getLynxAssessmentsToggle(): Promise<MatSlideToggleHarness | null> {
    if (!this.loader) return null;
    return await this.loader.getHarnessOrNull(MatSlideToggleHarness.with({ selector: '#lynx-assessments-enabled' }));
  }

  async getLynxAutoCorrectToggle(): Promise<MatSlideToggleHarness | null> {
    if (!this.loader) return null;
    return await this.loader.getHarnessOrNull(MatSlideToggleHarness.with({ selector: '#lynx-autocorrect-enabled' }));
  }

  async toggleSlideToggle(toggle: MatSlideToggleHarness): Promise<void> {
    await toggle.toggle();
    this.fixture.detectChanges();
    tick();
  }

  async isToggleChecked(toggle: MatSlideToggleHarness): Promise<boolean> {
    return await toggle.isChecked();
  }

  async isToggleDisabled(toggle: MatSlideToggleHarness): Promise<boolean> {
    return await toggle.isDisabled();
  }
}
