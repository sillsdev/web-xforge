import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { OverlayContainer } from '@angular/cdk/overlay';
import { CommonModule } from '@angular/common';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { mock, when } from 'ts-mockito';
import { ChildViewContainerComponent, configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { NoticeComponent } from '../../app/shared/notice/notice.component';
import { FeatureFlagService } from './feature-flag.service';
import { FeatureFlagsDialogComponent } from './feature-flags-dialog.component';

const mockedFeatureFlagService = mock(FeatureFlagService);

describe('FeatureFlagsComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule],
    providers: [{ provide: FeatureFlagService, useMock: mockedFeatureFlagService }]
  }));

  let overlayContainer: OverlayContainer;

  beforeEach(() => {
    overlayContainer = TestBed.inject(OverlayContainer);
  });

  afterEach(() => {
    // Prevents 'Error: Test did not clean up its overlay container content.'
    overlayContainer.ngOnDestroy();
  });

  it('Shows feature flags', fakeAsync(() => {
    const env = new TestEnvironment();

    // The feature flag is set locally but not on the server, so can be changed locally
    expect(env.getCheckboxLabel(0)).toBe('enabled flag');
    expect(env.getMatCheckbox(0).disabled).toBeFalsy();
    expect(env.getMatCheckbox(0).checked).toBeTruthy();

    // The feature flag is not set locally or on the server, so can be changed locally
    expect(env.getCheckboxLabel(1)).toBe('disabled flag');
    expect(env.getMatCheckbox(1).disabled).toBeFalsy();
    expect(env.getMatCheckbox(1).checked).toBeFalsy();

    // The feature flag is set to true on the server, so cannot be changed locally
    expect(env.getCheckboxLabel(2)).toBe('enabled readonly');
    expect(env.getMatCheckbox(2).disabled).toBeTruthy();
    expect(env.getMatCheckbox(2).checked).toBeTruthy();

    // The feature flag is set to false on the server, so cannot be changed locally
    expect(env.getCheckboxLabel(3)).toBe('disabled readonly');
    expect(env.getMatCheckbox(3).disabled).toBeTruthy();
    expect(env.getMatCheckbox(3).checked).toBeFalsy();
  }));
});

@NgModule({
  declarations: [FeatureFlagsDialogComponent],
  exports: [FeatureFlagsDialogComponent],
  imports: [
    CommonModule,
    UICommonModule,
    FormsModule,
    ReactiveFormsModule,
    TestTranslocoModule,
    NoopAnimationsModule,
    NoticeComponent
  ],
  providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
})
class DialogTestModule {}

class TestEnvironment {
  private readonly fixture: ComponentFixture<ChildViewContainerComponent>;

  constructor() {
    // Setup the data
    when(mockedFeatureFlagService.featureFlags).thenReturn([
      { key: 'enabled_flag', description: 'enabled flag', enabled: true, position: 0, readonly: false },
      { key: 'disabled_flag', description: 'disabled flag', enabled: false, position: 1, readonly: false },
      { key: 'enabled_readonly', description: 'enabled readonly', enabled: true, position: 2, readonly: true },
      { key: 'disabled_readonly', description: 'disabled readonly', enabled: false, position: 3, readonly: true }
    ]);

    // Setup the dialog
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const config: MatDialogConfig = {
      viewContainerRef: this.fixture.componentInstance.childViewContainer
    };
    TestBed.inject(MatDialog).open(FeatureFlagsDialogComponent, config);

    // Update the form
    tick();
    this.fixture.detectChanges();
    flush();
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get checkboxes(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.directive(MatCheckbox));
  }

  getCheckboxLabel(i: number): string | undefined {
    return this.checkboxes[i].injector.get(MatCheckbox)._labelElement.nativeElement.textContent?.trim();
  }

  getMatCheckbox(i: number): MatCheckbox {
    return this.checkboxes[i].injector.get(MatCheckbox);
  }
}
