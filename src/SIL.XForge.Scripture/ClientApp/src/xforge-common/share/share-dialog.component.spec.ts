import {
  MDC_DIALOG_DATA,
  MdcDialog,
  MdcDialogConfig,
  MdcDialogModule,
  MdcDialogRef,
  OverlayContainer
} from '@angular-mdc/web';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, DebugElement, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { flush } from '@angular/core/testing';
import { BrowserModule, By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { instance, mock } from 'ts-mockito';
import { DomainModel } from 'xforge-common/models/domain-model';
import { ProjectService } from 'xforge-common/project.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { ShareDialogComponent, ShareDialogData } from './share-dialog.component';

describe('ShareDialogComponent', () => {
  it('loads', () => {
    const env = new TestEnvironment();
    expect(env.dialogText).toContain('Share');
  });

  it('shows Send button when link sharing enabled', () => {
    const env = new TestEnvironment(true);
    expect(env.sendButton).toBeDefined();
  });

  it('shows Send button when link sharing is disabled', () => {
    const env = new TestEnvironment(false);
    expect(env.sendButton).toBeDefined();
  });

  it('Send button starts off saying Send', () => {
    const env = new TestEnvironment();
    expect(env.elementText(env.sendButton)).toEqual('Send');
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
    @ViewChild(ViewContainerDirective) viewContainer: ViewContainerDirective;

    get childViewContainer(): ViewContainerRef {
      return this.viewContainer.viewContainerRef;
    }
  }

  @NgModule({
    imports: [BrowserModule, HttpClientTestingModule, RouterTestingModule, UICommonModule, MdcDialogModule],
    declarations: [ViewContainerDirective, ChildViewContainerComponent, ShareDialogComponent],
    exports: [ViewContainerDirective, ChildViewContainerComponent, ShareDialogComponent],
    entryComponents: [ChildViewContainerComponent, ShareDialogComponent]
  })
  class TestModule {}

  class TestEnvironment {
    fixture: ComponentFixture<ChildViewContainerComponent>;
    component: ShareDialogComponent;
    dialogRef: MdcDialogRef<ShareDialogComponent>;
    overlayContainerElement: HTMLElement;
    afterCloseCallback: jasmine.Spy;

    mockedProjectService = mock(ProjectService);

    constructor(isLinkSharingEnabled?: boolean, projectId?: string) {
      TestBed.configureTestingModule({
        imports: [TestModule],
        providers: [
          { provide: MDC_DIALOG_DATA },
          { provide: DomainModel },
          { provide: ProjectService, useFactory: () => instance(this.mockedProjectService) }
        ]
      });
      this.fixture = TestBed.createComponent(ChildViewContainerComponent);
      const viewContainerRef = this.fixture.componentInstance.childViewContainer;

      const config: MdcDialogConfig<ShareDialogData> = {
        scrollable: true,
        viewContainerRef: viewContainerRef,
        data: {
          projectId: projectId === undefined ? 'project123' : projectId,
          isLinkSharingEnabled: isLinkSharingEnabled === undefined ? false : isLinkSharingEnabled
        }
      };
      this.dialogRef = TestBed.get(MdcDialog).open(ShareDialogComponent, config);
      this.afterCloseCallback = jasmine.createSpy('afterClose callback');
      this.dialogRef.afterClosed().subscribe(this.afterCloseCallback);
      this.component = this.dialogRef.componentInstance;
      this.overlayContainerElement = TestBed.get(OverlayContainer).getContainerElement();

      this.fixture.detectChanges();
    }

    get dialogText(): string {
      return this.overlayContainerElement.textContent;
    }

    get sendButton(): DebugElement {
      return this.fetchElement('#send-btn');
    }

    get emailTextField(): DebugElement {
      return this.fetchElement('#email');
    }

    fetchElement(query: string) {
      return this.fixture.debugElement.query(By.css(query));
    }

    elementText(element: DebugElement) {
      return element.nativeElement.textContent;
    }

    click(element: DebugElement): void {
      element.nativeElement.click();
      this.fixture.detectChanges();
      flush();
    }

    setTextFieldValue(element: HTMLElement | DebugElement, value: string) {
      if (element instanceof DebugElement) {
        element = element.nativeElement;
      }
      const inputElem: HTMLInputElement = (element as HTMLElement).querySelector('input');
      inputElem.value = value;
      inputElem.dispatchEvent(new Event('input'));
      this.fixture.detectChanges();
    }
  }
});
