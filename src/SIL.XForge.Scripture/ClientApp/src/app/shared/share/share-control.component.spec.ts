import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, DebugElement, NgModule, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed } from '@angular/core/testing';
import { flush } from '@angular/core/testing';
import { BrowserModule, By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { anything, capture, instance, mock, verify, when } from 'ts-mockito';
import { MemoryRealtimeOfflineStore } from 'xforge-common/memory-realtime-offline-store';
import { MemoryRealtimeDocAdapter } from 'xforge-common/memory-realtime-remote-store';
import { NoticeService } from 'xforge-common/notice.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareControlComponent } from './share-control.component';

describe('ShareControlComponent', () => {
  it('shows Send button when link sharing enabled', () => {
    const env = new TestEnvironment(true);
    expect(env.sendButton).not.toBeNull();
  });

  it('shows Send button when link sharing is disabled', () => {
    const env = new TestEnvironment(false);
    expect(env.sendButton).not.toBeNull();
  });

  it('Send button starts off saying Send', () => {
    const env = new TestEnvironment();
    expect(env.elementText(env.sendButton).trim()).toEqual('Send');
  });

  it('Send button says Send for unknown email; changes to Resend when email is already invitee', fakeAsync(() => {
    const env = new TestEnvironment();

    env.setTextFieldValue(env.emailTextField, 'unknown-address@example.com');
    expect(env.elementText(env.sendButton).trim()).toEqual('Send');
    env.setTextFieldValue(env.emailTextField, 'already@example.com');
    expect(env.elementText(env.sendButton).trim()).toEqual('Resend');

    // And back to Send
    env.setTextFieldValue(env.emailTextField, 'unknown-address@example.com');
    expect(env.elementText(env.sendButton).trim()).toEqual('Send');
  }));

  it('Resend button changes back to Send after sending', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'already@example.com');
    expect(env.elementText(env.sendButton).trim()).toEqual('Resend');
    env.click(env.sendButton);
    expect(env.elementText(env.sendButton).trim()).toEqual('Send');
  }));

  it('Server not queried to check if email is already invited until email address is valid', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'unkno');
    env.setTextFieldValue(env.emailTextField, 'unknown-addres');
    env.setTextFieldValue(env.emailTextField, 'unknown-address@exa');
    verify(env.mockedProjectService.onlineIsAlreadyInvited(anything(), anything())).never();
    env.setTextFieldValue(env.emailTextField, 'unknown-address@example.com');
    verify(env.mockedProjectService.onlineIsAlreadyInvited(anything(), anything())).once();
    expect().nothing();
  }));

  it('Message shown for not-yet-known invitee', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'unknown-address@example.com');
    env.click(env.sendButton);
    verify(env.mockedNoticeService.show(anything())).once();
    verify(env.mockedProjectService.onlineInvite(anything(), anything())).once();
    expect(capture(env.mockedNoticeService.show).last()[0]).toContain('email has been sent');
  }));

  it('Already-member message shown if invitee is already project member', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'already-project-member@example.com');
    env.click(env.sendButton);
    verify(env.mockedNoticeService.show(anything())).once();
    verify(env.mockedProjectService.onlineInvite(anything(), anything())).once();

    expect(capture(env.mockedNoticeService.show).last()[0]).toContain('is already');
  }));

  it('shareLink is for projectId', fakeAsync(() => {
    const env = new TestEnvironment(true, 'myProject1');
    expect(env.component.shareLink).toContain('myProject1');
    flush();
  }));

  it('Does not crash inviting blank email address if click Send twice', fakeAsync(() => {
    const env = new TestEnvironment();

    // Cannot invite blank or invalid email address
    env.click(env.sendButton);
    verify(env.mockedProjectService.onlineInvite(anything(), anything())).never();
    env.setTextFieldValue(env.emailTextField, '');
    env.click(env.sendButton);
    verify(env.mockedProjectService.onlineInvite(anything(), anything())).never();
    env.setTextFieldValue(env.emailTextField, 'unknown-addre');
    env.click(env.sendButton);
    verify(env.mockedProjectService.onlineInvite(anything(), anything())).never();

    // Invite
    env.setTextFieldValue(env.emailTextField, 'unknown-address@example.com');
    expect(env.getTextFieldValue(env.emailTextField)).toEqual('unknown-address@example.com', 'test setup');
    env.click(env.sendButton);
    verify(env.mockedProjectService.onlineInvite(anything(), anything())).once();

    // Can not immediately request an invite to a blank email address
    expect(env.getTextFieldValue(env.emailTextField)).toEqual('', 'test setup');
    env.click(env.sendButton);
    // Not called a second time
    verify(env.mockedProjectService.onlineInvite(anything(), anything())).once();

    // Invite
    env.setTextFieldValue(env.emailTextField, 'unknown-address2@example.com');
    env.click(env.sendButton);
    verify(env.mockedProjectService.onlineInvite(anything(), anything())).twice();
  }));

  it('Output event fires after invitation is sent', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'unknown-address@example.com');
    expect(env.hostComponent.invitedCount).toEqual(0);
    env.click(env.sendButton);
    expect(env.hostComponent.invitedCount).toEqual(1);
  }));

  @NgModule({
    imports: [BrowserModule, HttpClientTestingModule, RouterTestingModule, UICommonModule],
    declarations: [ShareControlComponent],
    exports: [ShareControlComponent],
    entryComponents: [ShareControlComponent]
  })
  class TestModule {}

  @Component({
    template: `
      <app-share-control
        [projectId]="projectId"
        [isLinkSharingEnabled]="isLinkSharingEnabled"
        (invited)="onInvited()"
      ></app-share-control>
    `
  })
  class TestHostComponent {
    @ViewChild(ShareControlComponent, { static: false }) component: ShareControlComponent;
    projectId = '';
    isLinkSharingEnabled = false;
    invitedCount = 0;

    onInvited() {
      this.invitedCount++;
    }
  }

  class TestEnvironment {
    readonly fixture: ComponentFixture<TestHostComponent>;
    readonly hostComponent: TestHostComponent;
    readonly component: ShareControlComponent;

    readonly mockedProjectService = mock(SFProjectService);
    readonly mockedNoticeService = mock(NoticeService);

    private readonly offlineStore = new MemoryRealtimeOfflineStore();

    constructor(isLinkSharingEnabled?: boolean, projectId?: string) {
      TestBed.configureTestingModule({
        declarations: [TestHostComponent],
        imports: [TestModule],
        providers: [
          { provide: SFProjectService, useFactory: () => instance(this.mockedProjectService) },
          { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) }
        ]
      });
      this.fixture = TestBed.createComponent(TestHostComponent);
      this.fixture.detectChanges();
      this.component = this.fixture.componentInstance.component;
      this.hostComponent = this.fixture.componentInstance;

      this.fixture.componentInstance.projectId = projectId === undefined ? 'project123' : projectId;
      this.fixture.componentInstance.isLinkSharingEnabled =
        isLinkSharingEnabled === undefined ? false : isLinkSharingEnabled;

      const projectDoc = new SFProjectDoc(
        this.offlineStore,
        new MemoryRealtimeDocAdapter(SFProjectDoc.COLLECTION, 'project01', {})
      );
      when(this.mockedProjectService.get(anything())).thenResolve(projectDoc);
      when(this.mockedProjectService.onlineInvite(anything(), 'unknown-address@example.com')).thenResolve(null);
      when(this.mockedProjectService.onlineInvite(anything(), 'already-project-member@example.com')).thenResolve(
        this.component.alreadyProjectMemberResponse
      );
      when(this.mockedProjectService.onlineIsAlreadyInvited(anything(), 'unknown-address@example.com')).thenResolve(
        false
      );
      when(this.mockedProjectService.onlineIsAlreadyInvited(anything(), 'already@example.com')).thenResolve(true);

      this.fixture.detectChanges();
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

    elementText(element: DebugElement): string {
      return element.nativeElement.textContent;
    }

    click(element: DebugElement): void {
      element.nativeElement.click();
      flush();
      this.fixture.detectChanges();
    }

    setTextFieldValue(element: HTMLElement | DebugElement, value: string) {
      if (element instanceof DebugElement) {
        element = element.nativeElement;
      }
      const inputElem: HTMLInputElement = (element as HTMLElement).querySelector('input');
      inputElem.value = value;
      inputElem.dispatchEvent(new Event('input'));
      flush();
      this.fixture.detectChanges();
    }

    getTextFieldValue(element: HTMLElement | DebugElement) {
      if (element instanceof DebugElement) {
        element = element.nativeElement;
      }
      const inputElem: HTMLInputElement = (element as HTMLElement).querySelector('input');
      return inputElem.value;
    }
  }
});
