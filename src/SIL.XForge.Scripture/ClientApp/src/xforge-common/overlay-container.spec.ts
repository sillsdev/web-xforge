import { OverlayContainer } from '@angular/cdk/overlay';
import { Component, DebugElement, TemplateRef, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatBottomSheet } from '@angular/material/bottom-sheet';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { InAppRootOverlayContainer } from './overlay-container';

describe('OverlayContainer', () => {
  it('should add overlay container as a child of app-root', fakeAsync(() => {
    const env = new TestEnvironment();
    expect(env.bottomSheetContainer).toBeFalsy();
    env.openBottomSheet();
    expect(env.bottomSheetContainer).toBeTruthy();
  }));
});

/**
 * Host component is generated to contain the <app-root> element. When tests are rendered the initial component
 * is only rendered as a <div> element whereas this test specifically needs access to the <app-root> element
 */
@Component({
  selector: 'app-host',
  template: '<app-root #root></app-root>',
  standalone: false
})
class HostComponent {
  @ViewChild('root') appRoot?: AppRootComponent;

  open(): void {
    this.appRoot?.open();
  }
}
@Component({
  selector: 'app-root',
  template: '<ng-template #bottomSheet><div class="bottom-sheet-container">Opened</div></ng-template>',
  standalone: false
})
class AppRootComponent {
  @ViewChild('bottomSheet') TemplateBottomSheet?: TemplateRef<any>;

  constructor(private bottomSheet: MatBottomSheet) {}

  open(): void {
    if (this.TemplateBottomSheet == null) {
      return;
    }
    this.bottomSheet.open(this.TemplateBottomSheet);
  }
}

class TestEnvironment {
  readonly component: HostComponent;
  readonly fixture: ComponentFixture<HostComponent>;

  constructor() {
    TestBed.configureTestingModule({
      declarations: [HostComponent, AppRootComponent],
      imports: [NoopAnimationsModule],
      providers: [{ provide: OverlayContainer, useClass: InAppRootOverlayContainer }]
    });

    this.fixture = TestBed.createComponent(HostComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }

  get bottomSheetContainer(): DebugElement {
    return this.fixture.debugElement.parent!.query(By.css('app-root .bottom-sheet-container'));
  }

  openBottomSheet(): void {
    this.component.open();
    this.wait();
  }

  private wait(): void {
    tick();
    this.fixture.detectChanges();
  }
}
