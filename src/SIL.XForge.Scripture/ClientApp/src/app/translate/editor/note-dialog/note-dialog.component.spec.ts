import { MdcDialog, MdcDialogRef } from '@angular-mdc/web/dialog';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, DebugElement, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CookieService } from 'ngx-cookie-service';
import { ParatextNoteThread } from 'realtime-server/lib/esm/scriptureforge/models/paratext-note-thread';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { TextData } from 'realtime-server/lib/scriptureforge/models/text-data';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import * as RichText from 'rich-text';
import { anything, mock, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { ParatextNoteThreadDoc } from '../../../core/models/paratext-note-thread-doc';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { getTextDoc } from '../../../shared/test-utils';
import { NoteDialogComponent, NoteDialogData } from './note-dialog.component';

const mockedAuthService = mock(AuthService);
const mockedCookieService = mock(CookieService);
const mockedHttpClient = mock(HttpClient);
const mockedProjectService = mock(SFProjectService);

describe('NoteDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: HttpClient, useMock: mockedHttpClient },
      { provide: SFProjectService, useMock: mockedProjectService }
    ]
  }));

  let env: TestEnvironment;
  afterEach(() => env.dialogRef.close());

  it('can display related segment', fakeAsync(() => {
    env = new TestEnvironment();

    expect(env.noteText.nativeElement.textContent).toEqual('before selection selected text after selection');
    expect(env.segmentText).toBeNull();
    env.toggleSegmentButton();
    expect(env.segmentText.nativeElement.textContent).toEqual('target: chapter 1, verse 1.');
  }));

  it('should not show deleted notes', fakeAsync(() => {
    env = new TestEnvironment();
    expect(env.notes.length).toBe(2);
  }));
});

@Directive({
  selector: 'appViewContainerDirective'
})
class ViewContainerDirective {
  constructor(public viewContainerRef: ViewContainerRef) {}
}

@Component({
  selector: 'app-view-container',
  template: '<appViewContainerDirective></appViewContainerDirective>'
})
class ChildViewContainerComponent {
  @ViewChild(ViewContainerDirective, { static: true }) viewContainer!: ViewContainerDirective;
}

@NgModule({
  imports: [CommonModule, UICommonModule, TestTranslocoModule],
  declarations: [ViewContainerDirective, ChildViewContainerComponent, NoteDialogComponent, OwnerComponent],
  exports: [ViewContainerDirective, ChildViewContainerComponent, NoteDialogComponent]
})
class DialogTestModule {}

class TestEnvironment {
  static PROJECT01: string = 'project01';
  static matthewText: TextInfo = {
    bookNum: 40,
    hasSource: false,
    chapters: [
      { number: 1, lastVerse: 25, isValid: true, permissions: {} },
      { number: 3, lastVerse: 17, isValid: true, permissions: {} }
    ],
    permissions: {}
  };
  static testProject: SFProject = {
    paratextId: 'pt01',
    shortName: 'P01',
    name: 'Project 01',
    writingSystem: { tag: 'en' },
    translateConfig: { translationSuggestionsEnabled: false },
    checkingConfig: {
      usersSeeEachOthersResponses: true,
      checkingEnabled: true,
      shareEnabled: true,
      shareLevel: CheckingShareLevel.Anyone
    },
    texts: [TestEnvironment.matthewText],
    sync: { queuedCount: 0 },
    userRoles: {
      user01: SFProjectRole.ParatextAdministrator
    }
  };
  static noteThread: ParatextNoteThread = {
    contextBefore: 'before selection ',
    contextAfter: ' after selection',
    startPosition: 0,
    dataId: 'thread01',
    notes: [
      {
        dataId: 'note01',
        threadId: 'thread01',
        content: 'note',
        extUserId: 'user01',
        deleted: false,
        ownerRef: 'user01',
        dateCreated: '',
        dateModified: ''
      },
      {
        dataId: 'note02',
        threadId: 'thread01',
        content: 'note02',
        extUserId: 'user01',
        deleted: false,
        ownerRef: 'user01',
        dateCreated: '',
        dateModified: ''
      },
      {
        dataId: 'note03',
        threadId: 'thread01',
        content: 'note03',
        extUserId: 'user01',
        deleted: true,
        ownerRef: 'user01',
        dateCreated: '',
        dateModified: ''
      }
    ],
    ownerRef: 'user01',
    projectRef: TestEnvironment.PROJECT01,
    selectedText: 'selected text',
    tagIcon: 'flag02',
    verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 }
  };

  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  readonly component: NoteDialogComponent;
  readonly dialogRef: MdcDialogRef<NoteDialogComponent>;
  readonly mockedNoteMdcDialogRef = mock(MdcDialogRef);

  constructor() {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const configData: NoteDialogData = {
      projectId: TestEnvironment.PROJECT01,
      threadId: TestEnvironment.noteThread.dataId
    };
    this.dialogRef = TestBed.inject(MdcDialog).open(NoteDialogComponent, { data: configData });
    this.component = this.dialogRef.componentInstance;
    tick();

    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: configData.projectId,
      data: TestEnvironment.testProject
    });
    const textDocId = new TextDocId(TestEnvironment.PROJECT01, 40, 1);
    this.realtimeService.addSnapshot<TextData>(TextDoc.COLLECTION, {
      id: textDocId.toString(),
      data: getTextDoc(textDocId),
      type: RichText.type.name
    });
    this.realtimeService.addSnapshot<ParatextNoteThread>(ParatextNoteThreadDoc.COLLECTION, {
      id: [TestEnvironment.PROJECT01, TestEnvironment.noteThread.dataId].join(':'),
      data: TestEnvironment.noteThread
    });

    when(mockedProjectService.getNoteThread(anything())).thenCall(id =>
      this.realtimeService.subscribe(ParatextNoteThreadDoc.COLLECTION, id)
    );

    when(mockedProjectService.getNoteThreadIcon(anything())).thenResolve();

    when(mockedProjectService.get(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, id)
    );

    when(mockedProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id)
    );

    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
    flush();
  }

  get flagIcon(): string {
    return this.overlayContainerElement.query(By.css('mdc-dialog-title img')).nativeElement.getAttribute('src');
  }

  get notes(): DebugElement[] {
    return this.overlayContainerElement.queryAll(By.css('.notes .note'));
  }

  get noteText(): DebugElement {
    return this.overlayContainerElement.query(By.css('.note-text'));
  }

  get segmentText(): DebugElement {
    return this.overlayContainerElement.query(By.css('.segment-text'));
  }

  toggleSegmentButton(): void {
    this.component.toggleSegmentText();
    tick();
    this.fixture.detectChanges();
  }

  private get overlayContainerElement(): DebugElement {
    return this.fixture.debugElement.parent!.query(By.css('.cdk-overlay-container'));
  }
}
