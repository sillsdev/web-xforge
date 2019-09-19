import { MdcDialogModule, MdcDialogRef, OverlayContainer } from '@angular-mdc/web';
import { NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { LocationService } from 'xforge-common/location.service';
import { MemoryRealtimeOfflineStore } from 'xforge-common/memory-realtime-offline-store';
import { MemoryRealtimeDocAdapter } from 'xforge-common/memory-realtime-remote-store';
import { NoticeService } from 'xforge-common/notice.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareControlComponent } from './share-control.component';
import { ShareDialogComponent } from './share-dialog.component';
import { ShareComponent } from './share.component';

describe('ShareComponent', () => {
  it('share button should be hidden when sharing is disabled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setShareConfig(false, CheckingShareLevel.Anyone);
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    expect(env.shareButton).toBeNull();
  }));

  it('dialog should open when sharing is enabled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.shareButton);

    env.clickElement(env.closeButton);
    verify(env.mockedProjectService.onlineInvite('project01', anything())).never();
    expect().nothing();
  }));

  it('dialog should not send when email is invalid', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.shareButton);
    env.clickElement(env.emailInput);
    env.setInputValue(env.emailInput, 'notAnEmailAddress');
    env.clickElement(env.sendInviteButton);

    env.clickElement(env.closeButton);
    verify(env.mockedProjectService.onlineInvite('project01', anything())).never();
    expect().nothing();
  }));

  it('dialog should not send when email is empty', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.shareButton);
    env.setInputValue(env.emailInput, 'notAnEmailAddress');
    env.clickElement(env.emailInput);
    env.setInputValue(env.emailInput, '');
    env.clickElement(env.sendInviteButton);

    env.clickElement(env.closeButton);
    verify(env.mockedProjectService.onlineInvite('project01', anything())).never();
    expect().nothing();
  }));

  it('dialog should send when email is valid', fakeAsync(() => {
    const emailAddress = 'me@example.com';
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.shareButton);
    env.setInputValue(env.emailInput, emailAddress);
    expect(env.emailInput.querySelector('input').value).toBe(emailAddress);
    env.clickElement(env.sendInviteButton);

    env.clickElement(env.closeButton);
    verify(env.mockedProjectService.onlineInvite('project01', emailAddress)).once();
  }));

  it('share link should be hidden if link sharing is turned off', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setShareConfig(true, CheckingShareLevel.Specific);
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.shareButton);
    expect(env.shareLink).toBeNull();
  }));

  it('clicking copy link icon should copy link to clipboard', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.shareButton);
    expect(env.shareLink.value).toEqual('https://scriptureforge.org/projects/project01?sharing=true');
    env.clickElement(env.shareLinkCopyIcon);
    // TODO: figure out a way to check the clipboard data
    verify(env.mockedNoticeService.show(anything())).once();
  }));
});

@NgModule({
  imports: [FormsModule, MdcDialogModule, ReactiveFormsModule, NoopAnimationsModule, UICommonModule],
  exports: [ShareDialogComponent, ShareControlComponent],
  declarations: [ShareDialogComponent, ShareControlComponent],
  entryComponents: [ShareDialogComponent, ShareControlComponent]
})
class DialogTestModule {}

class TestEnvironment {
  readonly component: ShareComponent;
  readonly fixture: ComponentFixture<ShareComponent>;
  readonly overlayContainer: OverlayContainer;

  readonly mockedMdcDialogRef: MdcDialogRef<ShareDialogComponent> = mock(MdcDialogRef);
  readonly mockedProjectService = mock(SFProjectService);
  readonly mockedNoticeService = mock(NoticeService);
  readonly mockedActivatedRoute = mock(ActivatedRoute);
  readonly mockedLocationService = mock(LocationService);

  private readonly offlineStore = new MemoryRealtimeOfflineStore();

  constructor() {
    when(this.mockedProjectService.onlineInvite('project01', anything())).thenResolve();
    when(this.mockedNoticeService.show(anything())).thenResolve();
    when(this.mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(this.mockedLocationService.origin).thenReturn('https://scriptureforge.org');
    this.setShareConfig(true, CheckingShareLevel.Anyone);

    TestBed.configureTestingModule({
      imports: [DialogTestModule],
      declarations: [ShareComponent],
      providers: [
        { provide: MdcDialogRef, useFactory: () => instance(this.mockedMdcDialogRef) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedProjectService) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: LocationService, useFactory: () => instance(this.mockedLocationService) }
      ]
    });
    this.fixture = TestBed.createComponent(ShareComponent);
    this.component = this.fixture.componentInstance;
    this.overlayContainer = TestBed.get(OverlayContainer);
  }

  get shareButton(): HTMLButtonElement {
    return this.fixture.nativeElement.querySelector('#share-btn');
  }

  get sendInviteButton(): HTMLButtonElement {
    const overlayContainerElement = this.overlayContainer.getContainerElement();
    return overlayContainerElement.querySelector('#send-btn');
  }

  get closeButton(): HTMLButtonElement {
    const overlayContainerElement = this.overlayContainer.getContainerElement();
    return overlayContainerElement.querySelector('#close-btn');
  }

  get emailInput(): HTMLElement {
    const overlayContainerElement = this.overlayContainer.getContainerElement();
    return overlayContainerElement.querySelector('#email');
  }

  get shareLink(): HTMLInputElement {
    const overlayContainerElement = this.overlayContainer.getContainerElement();
    return overlayContainerElement.querySelector('#share-link input');
  }

  get shareLinkCopyIcon(): HTMLElement {
    const overlayContainerElement = this.overlayContainer.getContainerElement();
    return overlayContainerElement.querySelector('#share-link-copy-icon');
  }

  clickElement(element: HTMLElement): void {
    element.click();
    flush();
    this.fixture.detectChanges();
  }

  setInputValue(textField: HTMLElement, value: string): void {
    const inputElem: HTMLInputElement = textField.querySelector('input');
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    this.fixture.detectChanges();
    tick();
  }

  setShareConfig(shareEnabled: boolean, shareLevel: CheckingShareLevel): void {
    const project: SFProject = {
      name: 'project 01',
      paratextId: 'pt01',
      shortName: 'P01',
      writingSystem: { tag: 'qaa' },
      translateConfig: { translationSuggestionsEnabled: false },
      checkingConfig: {
        checkingEnabled: true,
        usersSeeEachOthersResponses: true,
        shareEnabled,
        shareLevel
      },
      sync: { queuedCount: 0 },
      texts: [],
      userRoles: {}
    };
    const projectDoc = new SFProjectDoc(
      this.offlineStore,
      new MemoryRealtimeDocAdapter(SFProjectDoc.COLLECTION, 'project01', project)
    );
    when(this.mockedProjectService.get(anything())).thenResolve(projectDoc);
  }
}
