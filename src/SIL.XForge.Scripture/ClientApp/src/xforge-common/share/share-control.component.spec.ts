import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, DebugElement, NgModule, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed } from '@angular/core/testing';
import { flush } from '@angular/core/testing';
import { BrowserModule, By } from '@angular/platform-browser';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject } from 'rxjs';
import { anything, capture, instance, mock, verify, when } from 'ts-mockito';
import { MapQueryResults } from 'xforge-common/json-api.service';
import { DomainModel } from 'xforge-common/models/domain-model';
import { Project } from 'xforge-common/models/project';
import { NoticeService } from 'xforge-common/notice.service';
import { ProjectService } from 'xforge-common/project.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
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
  }));

  it('Message shown for not-yet-known invitee', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'unknown-address@example.com');
    env.click(env.sendButton);
    verify(env.mockedNoticeService.show(anything())).once();
    expect(capture(env.mockedNoticeService.show).last()[0]).toContain('email has been sent');
  }));

  it('Already-member message shown if invitee is already project member', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailTextField, 'already-project-member@example.com');
    env.click(env.sendButton);
    verify(env.mockedNoticeService.show(anything())).once();
    expect(capture(env.mockedNoticeService.show).last()[0]).toContain('is already');
  }));

  it('shareLink is for projectId', fakeAsync(() => {
    const env = new TestEnvironment(true, 'myProject1');
    expect(env.component.shareLink).toContain('myProject1');
    flush();
  }));

  @NgModule({
    imports: [BrowserModule, HttpClientTestingModule, RouterTestingModule, UICommonModule],
    declarations: [ShareControlComponent],
    exports: [ShareControlComponent],
    entryComponents: [ShareControlComponent]
  })
  class TestModule {}

  class TestProject extends Project {
    constructor(init?: Partial<Project>) {
      super(init);
    }

    get taskNames(): string[] {
      return [];
    }
  }

  @Component({
    template:
      '<app-share-control [projectId]="projectId" [isLinkSharingEnabled]="isLinkSharingEnabled"></app-share-control>'
  })
  class TestHostComponent {
    @ViewChild(ShareControlComponent) component: ShareControlComponent;
    projectId = '';
    isLinkSharingEnabled = false;
  }

  class TestEnvironment {
    fixture: ComponentFixture<TestHostComponent>;
    component: ShareControlComponent;

    mockedProjectService = mock(ProjectService);
    mockedNoticeService = mock(NoticeService);

    private readonly project$: BehaviorSubject<MapQueryResults<Project>> = new BehaviorSubject<
      MapQueryResults<Project>
    >(
      new MapQueryResults(
        new TestProject({
          id: 'project01'
        })
      )
    );

    constructor(isLinkSharingEnabled?: boolean, projectId?: string) {
      TestBed.configureTestingModule({
        declarations: [TestHostComponent],
        imports: [TestModule],
        providers: [
          { provide: DomainModel },
          { provide: ProjectService, useFactory: () => instance(this.mockedProjectService) },
          { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) }
        ]
      });
      this.fixture = TestBed.createComponent(TestHostComponent);
      this.fixture.detectChanges();
      this.component = this.fixture.componentInstance.component;

      this.fixture.componentInstance.projectId = projectId === undefined ? 'project123' : projectId;
      this.fixture.componentInstance.isLinkSharingEnabled =
        isLinkSharingEnabled === undefined ? false : isLinkSharingEnabled;

      when(this.mockedProjectService.get(anything())).thenReturn(this.project$);
      when(this.mockedProjectService.get(anything(), anything())).thenReturn(this.project$);
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
  }
});
