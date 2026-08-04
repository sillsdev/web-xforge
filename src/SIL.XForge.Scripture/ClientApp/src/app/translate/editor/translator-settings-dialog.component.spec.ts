import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSlideToggleHarness } from '@angular/material/slide-toggle/testing';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import {
  getSFProjectUserConfigDocId,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { createTestProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config-test-data';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { provideTestRealtime } from 'xforge-common/test-realtime-providers';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import {
  ChildViewContainerComponent,
  configureTestingModule,
  getTestTranslocoModule,
  matDialogCloseDelay
} from 'xforge-common/test-utils';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { NoticeComponent } from '../../shared/notice/notice.component';
import {
  TranslatorSettingsDialogComponent,
  TranslatorSettingsDialogData
} from './translator-settings-dialog.component';

describe('TranslatorSettingsDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [getTestTranslocoModule(), NoticeComponent, TranslatorSettingsDialogComponent],
    providers: [provideTestOnlineStatus(), provideTestRealtime(SF_TYPE_REGISTRY)]
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

    it('should show only auto-corrections switch when only auto-corrections is enabled in project', fakeAsync(() => {
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
        userConfig: {
          lynxInsightState: {
            assessmentsEnabled: true,
            autoCorrectionsEnabled: true
          }
        },
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
      expect(env.component!.lynxMasterSwitch.value).toBe(true);
      expect(await env.isToggleChecked(lynxMasterToggle!)).toBe(true);

      await env.toggleSlideToggle(lynxMasterToggle!);
      expect(env.component!.lynxMasterSwitch.value).toBe(false);
      expect(await env.isToggleChecked(lynxMasterToggle!)).toBe(false);

      const userConfigDoc = env.getProjectUserConfigDoc();
      expect(userConfigDoc.data!.lynxInsightState?.autoCorrectionsEnabled).toBe(false);
      expect(userConfigDoc.data!.lynxInsightState?.assessmentsEnabled).toBe(false);
      env.closeDialog();
    }));
  });
});

class TestEnvironment {
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  component?: TranslatorSettingsDialogComponent;
  loader?: HarnessLoader;
  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    this.setProjectUserConfig();
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get closeButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('button[mat-dialog-close]') as HTMLElement;
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
      data: createTestProjectProfile({ userRoles: { user01: SFProjectRole.ParatextTranslator } })
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
      ...userConfig
    });

    this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
      id: getSFProjectUserConfigDocId('project01', user1Config.ownerRef),
      data: user1Config
    });

    const projectProfile = {
      ...createTestProjectProfile({
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
