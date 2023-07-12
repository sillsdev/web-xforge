import { CommonModule } from '@angular/common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { TranslocoService } from '@ngneat/transloco';
import Quill, { DeltaStatic, RangeStatic } from 'quill';
import QuillCursors from 'quill-cursors';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TextAnchor } from 'realtime-server/lib/esm/scriptureforge/models/text-anchor';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { VerseRef } from '@sillsdev/scripture';
import * as RichText from 'rich-text';
import { BehaviorSubject } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { AvatarTestingModule } from 'xforge-common/avatar/avatar-testing.module';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { MockConsole } from 'xforge-common/mock-console';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserService } from 'xforge-common/user.service';
import { DialogService } from 'xforge-common/dialog.service';
import { LocalPresence } from 'sharedb/lib/sharedb';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { User } from 'realtime-server/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { Delta, TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { SharedModule } from '../shared.module';
import { getCombinedVerseTextDoc, getEmptyChapterDoc, getPoetryVerseTextDoc, getTextDoc } from '../test-utils';
import { PresenceData, PRESENCE_EDITOR_ACTIVE_TIMEOUT, RemotePresences, TextComponent } from './text.component';
import { TextNoteDialogComponent, TextNoteType } from './text-note-dialog/text-note-dialog.component';

const mockedBugsnagService = mock(BugsnagService);
const mockedPwaService = mock(PwaService);
const mockedProjectService = mock(SFProjectService);
const mockedTranslocoService = mock(TranslocoService);
const mockedUserService = mock(UserService);
const mockedConsole: MockConsole = MockConsole.install();
const mockedDialogService = mock(DialogService);

describe('TextComponent', () => {
  configureTestingModule(() => ({
    declarations: [HostComponent],
    imports: [
      AvatarTestingModule,
      CommonModule,
      HttpClientTestingModule,
      UICommonModule,
      SharedModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: TranslocoService, useMock: mockedTranslocoService },
      { provide: UserService, useMock: mockedUserService },
      { provide: DialogService, useMock: mockedDialogService }
    ]
  }));
  beforeEach(() => {
    mockedConsole.reset();
  });

  it('display placeholder messages', fakeAsync(() => {
    const env: TestEnvironment = new TestEnvironment();
    const mockedQuill = new MockQuill('quill-editor');
    env.fixture.detectChanges();
    env.component.onEditorCreated(mockedQuill);
    expect(env.component.placeholder).toEqual('initial placeholder text');
    env.id = new TextDocId('project01', 40, 1);
    tick();
    expect(env.component.placeholder).toEqual('text.loading');
    env.onlineStatus = false;
    env.fixture.detectChanges();
    expect(env.component.placeholder).toEqual('text.not_available_offline');
    env.onlineStatus = true;
    expect(env.component.placeholder).toEqual('text.loading');
  }));

  it('does not apply right to left for placeholder message', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    env.hostComponent.isTextRightToLeft = true;
    env.fixture.detectChanges();
    expect(env.component.placeholder).toEqual('initial placeholder text');
    expect(env.component.isRtl).toBe(false);
    expect(env.fixture.nativeElement.querySelector('quill-editor[dir="auto"]')).not.toBeNull();
  }));

  it('handles a null style on a paragraph', fakeAsync(() => {
    const env: TestEnvironment = new TestEnvironment();
    const mockedQuill = new MockQuill('quill-editor');
    env.fixture.detectChanges();
    env.component.onEditorCreated(mockedQuill);
    env.id = new TextDocId('project01', 40, 1);
    tick();
    env.fixture.detectChanges();
    expect(env.component.editor?.getText()).withContext('setup').toContain('chapter 1, verse 6.');
    expect(env.component.editor?.getContents().ops?.length).withContext('setup').toEqual(25);

    env.component.editor?.updateContents(new Delta().retain(109).retain(31, { para: null }));
    flush();

    const ops = env.component.editor?.getContents().ops;
    if (ops != null) {
      const lastPara = ops[18];
      expect(lastPara.attributes).not.toBeNull();
    } else {
      fail('should not get here if test is working properly!');
    }
  }));

  it('can highlight combined verses', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    env.id = new TextDocId('project01', 41, 1);
    tick();
    env.fixture.detectChanges();
    env.hostComponent.isReadOnly = true;

    // segments overlaps on verse 2
    env.component.setSegment('verse_1_2');
    tick();
    env.fixture.detectChanges();
    expect(env.component.segment!.ref).toEqual('verse_1_2-3');
    env.component.highlight();
    tick();
    env.fixture.detectChanges();
    expect(env.isSegmentHighlighted(1, '2-3')).toBe(true);

    // segments overlaps on verse 3
    env.component.setSegment('verse_1_3');
    tick();
    env.fixture.detectChanges();
    expect(env.component.segment!.ref).toEqual('verse_1_2-3');
    env.component.highlight();
    tick();
    env.fixture.detectChanges();
    expect(env.isSegmentHighlighted(1, '2-3')).toBe(true);

    TestEnvironment.waitForPresenceTimer();
  }));

  it('adds data attributes for usfm labels', fakeAsync(() => {
    const env: TestEnvironment = new TestEnvironment();
    env.fixture.detectChanges();
    env.id = new TextDocId('project01', 40, 1);
    tick();
    env.fixture.detectChanges();

    // document starts with no description on title
    const titleSegment = env.component.editor!.container.querySelector('usx-para[data-style="s"] usx-segment')!;
    expect(titleSegment.getAttribute('data-style-description')).toBeNull();

    // highlighting title causes style description to be shown
    env.component.highlight(['s_1']);
    tick();

    expect(titleSegment.getAttribute('data-style-description')).toEqual('s - Heading - Section Level 1');
    // This is a CSS computed value, and it's a string, so it needs quotes around it
    expect(window.getComputedStyle(titleSegment, '::before').content).toEqual('"s - Heading - Section Level 1"');

    // highlighting verse 1 does not cause a description to be shown because it's in a paragraph with style p
    env.component.highlight(['verse_1_1']);
    tick();

    const verse1 = env.component.editor!.container.querySelector('usx-segment[data-segment="verse_1_1"]')!;
    expect(verse1.getAttribute('data-style-description')).toBeNull();

    // The title segment should still have its data attribute, but no pseudo element
    expect(titleSegment.getAttribute('data-style-description')).toEqual('s - Heading - Section Level 1');
    expect(window.getComputedStyle(titleSegment, '::before').content).toEqual('none');
  }));

  it('correctly labels verse segments after line breaks', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    env.id = new TextDocId('project01', 42, 1);
    tick();
    env.fixture.detectChanges();

    const verseSegments: string[] = env.component.getVerseSegments(VerseRef.parse('LUK 1:1'));
    expect(verseSegments).toEqual(['verse_1_1', 'verse_1_1/q_1', 'verse_1_1/q_2', 'verse_1_1/q_3']);
    const segmentText = env.component.getSegmentText('verse_1_1/q_2');
    expect(segmentText).toEqual('Poetry third line');
  }));

  it('can undo when segment is blank', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    env.id = new TextDocId('project01', 43, 1);
    tick();
    env.fixture.detectChanges();

    const range: RangeStatic = env.component.getSegmentRange('s_3')!;
    env.component.editor!.setSelection(range.index + 1, 'user');
    tick();
    env.fixture.detectChanges();
    env.insertText(range.index + 1, 'text');

    // SUT
    env.triggerUndo();
    const rangePostUndo: RangeStatic | undefined = env.component.getSegmentRange('s_3');
    expect(rangePostUndo).toBeTruthy();

    TestEnvironment.waitForPresenceTimer();
  }));

  it('pastes text with proper attributes', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    env.id = new TextDocId('project01', 40, 1);
    tick();
    env.fixture.detectChanges();
    env.embedNoteAtVerse(1);
    tick();
    env.fixture.detectChanges();

    const range: RangeStatic = env.component.getSegmentRange('verse_1_1')!;
    env.component.editor!.setSelection(range.index, 0, 'user');
    tick();
    env.fixture.detectChanges();
    let segmentElement: HTMLElement = env.getSegment('verse_1_1')!;
    expect(segmentElement.classList).toContain('note-thread-segment');
    const pasteText = 'paste text';
    let contents: DeltaStatic = env.component.getSegmentContents('verse_1_1')!;
    expect(contents.ops![0].insert).toEqual('target: ');
    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', pasteText);
    const pasteEvent = new ClipboardEvent('paste', { clipboardData: dataTransfer });
    env.component.editor!.root.dispatchEvent(pasteEvent);
    tick(10);
    env.fixture.detectChanges();

    expect(env.quillEditor.querySelectorAll('usx-segment[data-segment="verse_1_1"]').length).toEqual(1);
    segmentElement = env.getSegment('verse_1_1')!;
    expect(segmentElement.classList).toContain('note-thread-segment');
    contents = env.component.getSegmentContents('verse_1_1')!;
    expect(contents.ops![0].insert).toEqual(pasteText + 'target: ');

    TestEnvironment.waitForPresenceTimer();
  }));

  describe('MultiCursor Presence', () => {
    it('should update presence if the user moves the cursor', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();
      const onSelectionChangedSpy = spyOn<any>(env.component, 'onSelectionChanged').and.callThrough();
      const localPresenceSubmitSpy = spyOn<any>(env.localPresenceDoc, 'submit').and.callThrough();

      env.component.editor?.setSelection(1, 1, 'user');

      tick();
      expect(onSelectionChangedSpy).toHaveBeenCalledTimes(1);
      expect(localPresenceSubmitSpy).toHaveBeenCalledTimes(1);
      verify(mockedUserService.getCurrentUser()).once();
    }));

    it('should not update presence if offline', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.onlineStatus = false;
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();
      const cursors: QuillCursors = env.component.editor!.getModule('cursors');
      const cursorRemoveSpy = spyOn<any>(cursors, 'removeCursor').and.callThrough();
      const onSelectionChangedSpy = spyOn<any>(env.component, 'onSelectionChanged').and.callThrough();
      const localPresenceSubmitSpy = spyOn<any>(env.localPresenceDoc, 'submit').and.callThrough();

      env.component.editor?.setSelection(1, 1, 'user');

      // ShareDB will trigger a presence "submit" event on the doc, so we need to simulate that event
      const range: RangeStatic = env.component.getSegmentRange('verse_1_1')!;
      (env.component as any).onPresenceDocReceive('presenceId', range);

      tick();
      expect(onSelectionChangedSpy).toHaveBeenCalledTimes(1);
      expect(localPresenceSubmitSpy).toHaveBeenCalledTimes(0);
      expect(cursorRemoveSpy).toHaveBeenCalledTimes(1);
    }));

    it('should clear doc presence on blur', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();
      const onSelectionChangedSpy = spyOn<any>(env.component, 'onSelectionChanged').and.callThrough();
      const localPresenceSubmitSpy = spyOn<any>(env.localPresenceDoc, 'submit').and.callThrough();

      env.component.onSelectionChanged({ index: 0, length: 0 });

      tick();
      expect(onSelectionChangedSpy).toHaveBeenCalledTimes(1);
      expect(localPresenceSubmitSpy).toHaveBeenCalledTimes(1);
      verify(mockedUserService.getCurrentUser()).once();

      env.component.onSelectionChanged(null as unknown as RangeStatic);

      tick();
      expect(onSelectionChangedSpy).toHaveBeenCalledTimes(2);
      expect(localPresenceSubmitSpy).toHaveBeenCalledTimes(2);
      verify(mockedUserService.getCurrentUser()).once();
    }));

    it('should use "Anonymous" when the displayName is undefined', fakeAsync(() => {
      const callback: (env: TestEnvironment) => void = (env: TestEnvironment) => {
        env.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
          id: 'user02',
          data: createTestUser({ displayName: '' }, 2)
        });
        when(mockedUserService.getCurrentUser()).thenCall(() =>
          env.realtimeService.subscribe(UserDoc.COLLECTION, 'user02')
        );
      };
      const env: TestEnvironment = new TestEnvironment({ callback });
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();

      env.component.onSelectionChanged({ index: 0, length: 0 });

      tick();
      verify(mockedUserService.getCurrentUser()).once();
      verify(mockedTranslocoService.translate('editor.anonymous')).once();
      expect().nothing();
    }));

    it('should learn and announce about new remote presences', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();
      const presenceChangeEmitSpy: jasmine.Spy<any> = spyOn<any>((env.component as any).presenceChange, 'emit');

      expect(Object.keys(env.remoteDocPresences).length)
        .withContext('setup: sharedb presence info should start off empty')
        .toEqual(0);

      // SUT
      env.addRemotePresence('remote-person-1');
      env.addRemotePresence('remote-person-2');
      const numberRemotePersons: number = 2;

      expect(Object.keys(env.remoteDocPresences).length)
        .withContext('setup: sharedb presence info should contain remote person(s)')
        .toEqual(numberRemotePersons);

      tick();
      expect(presenceChangeEmitSpy)
        .withContext('should have announced persons')
        .toHaveBeenCalledTimes(numberRemotePersons);
    }));

    it('should clear remote presences when unload textdoc', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();

      env.addRemotePresence('remote-person-1');
      env.addRemotePresence('remote-person-2');
      expect(Object.keys(env.hostComponent.remotePresences!).length)
        .withContext('some remote person(s) should have been reported')
        .toEqual(2);

      // Leaving the text doc should dismiss their presence to other users
      env.component.ngOnDestroy();
      tick();

      expect(Object.keys(env.hostComponent.remotePresences!).length)
        .withContext('the remote persons list should be empty')
        .toEqual(0);
      expect((env.component as any).presence)
        .withContext('presence info should be absent')
        .toBeUndefined();
    }));

    it('should emit user active when editing', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();
      const presenceChannelSubmit = spyOn<any>(env.localPresenceChannel, 'submit');

      const range: RangeStatic = env.component.getSegmentRange('verse_1_1')!;
      env.component.editor!.setSelection(range.index + 1, 'user');
      tick();
      env.fixture.detectChanges();
      env.insertText(range.index + 1, 'text');

      // After a text update the channel will emit that the user is active
      let presenceData: PresenceData = presenceChannelSubmit.calls.mostRecent().args[0] as PresenceData;
      expect(presenceData.viewer.activeInEditor).toBe(true);

      // After a set period of time the channel will emit that the user is no longer active
      TestEnvironment.waitForPresenceTimer();
      presenceData = presenceChannelSubmit.calls.mostRecent().args[0] as PresenceData;
      expect(presenceData.viewer.activeInEditor).toBe(false);
    }));

    it('should not emit doc presence when in read only mode', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.hostComponent.isReadOnly = true;
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();

      const presenceDocSubmit = spyOn<any>(env.localPresenceDoc, 'submit');
      const range: RangeStatic = env.component.getSegmentRange('verse_1_1')!;
      env.component.editor!.setSelection(range.index + 1, 'user');
      tick();
      env.fixture.detectChanges();

      expect(presenceDocSubmit).withContext('presenceChanelDoc').toHaveBeenCalledTimes(0);
    }));

    it('should not register to local presence when presence is disabled', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment({ presenceEnabled: false });
      const presenceChangeEmitSpy: jasmine.Spy<any> = spyOn<any>((env.component as any).presenceChange, 'emit');
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();

      expect(env.localPresenceDoc).toBeUndefined();
      expect(env.localPresenceChannel).toBeUndefined();
      expect(presenceChangeEmitSpy).toHaveBeenCalledTimes(0);
    }));

    it('should scroll to cursor of viewer', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();

      const remotePresence = 'remote-person-1';
      const remoteSegmentRef = 'verse_1_1';
      const remoteRange: RangeStatic | undefined = env.component.getSegmentRange(remoteSegmentRef);
      env.addRemotePresence(remotePresence, remoteRange);
      expect(env.component.editor!.root.scrollTop).toEqual(0);
      const presenceData: PresenceData = {
        viewer: (env.component as any).getPresenceViewer(remotePresence)
      };
      const setSelectionSpy = spyOn<any>(env.component.editor!, 'setSelection')
        .withArgs(remoteRange)
        .and.returnValue(true);
      const presenceDataActive: PresenceData = { viewer: { ...presenceData.viewer, activeInEditor: true } };
      const presenceChannelReceiveSpy = spyOn<any>(env.component, 'onPresenceChannelReceive')
        .withArgs(remotePresence, presenceDataActive)
        .and.returnValue(true)
        .withArgs(remotePresence, presenceData)
        .and.returnValue(true);
      env.component.scrollToViewer(presenceData.viewer);
      expect(setSelectionSpy).toHaveBeenCalledTimes(1);
      expect(presenceChannelReceiveSpy).toHaveBeenCalledTimes(1);

      // Wait for timer to emit another call to not show the user as active
      presenceChannelReceiveSpy.calls.reset();
      tick(3000);
      expect(presenceChannelReceiveSpy).toHaveBeenCalledTimes(1);
    }));

    it('should update presence if the user data changes', fakeAsync(() => {
      const updatedAvatarUrl: string = 'https://example.com/avatar-updated.png';
      const env: TestEnvironment = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();
      const presenceChannelSubmit = spyOn<any>(env.localPresenceChannel, 'submit');
      const userDoc: UserDoc = env.getUserDoc('user01');
      expect(userDoc.data?.avatarUrl).not.toEqual(updatedAvatarUrl);

      userDoc.submitJson0Op(op => op.set(u => u.avatarUrl, updatedAvatarUrl));
      expect(userDoc.data?.avatarUrl).toEqual(updatedAvatarUrl);
      expect(presenceChannelSubmit).toHaveBeenCalledTimes(1);

      TestEnvironment.waitForPresenceTimer();
    }));
  });

  describe('drag-and-drop', () => {
    it('drop is cancelled and does not change content', fakeAsync(() => {
      // In this situation, 'external' includes text from another application, another browser window, or text in the
      // same SF web page but outside of the text area.
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      const initialTextInDoc = 'target: chapter 1, verse 4.';
      const textToDropIn = 'Hello\nHello\r\nHello';
      // A successful drag of the text would result in the final text being
      // 'target: chapterHello Hello Hello 1, verse 4.'
      const originalAllText: string = env.component.editor!.getText();
      const targetSegmentRef: string = 'verse_1_4';
      expect(env.component.getSegmentText(targetSegmentRef)).withContext('setup').toEqual(initialTextInDoc);
      expect(env.component.editor!.getText()).withContext('setup').toContain(initialTextInDoc);

      const targetSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (targetSegmentRange == null) throw Error('setup');
      const selectionStart: number = targetSegmentRange.index + 'ta'.length;
      const selectionLength: number = 'rg'.length;
      // A couple characters in the segment are selected.
      env.component.editor?.setSelection(selectionStart, selectionLength);
      const originalSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (originalSelection == null) throw Error('setup');

      // When the user drops text into their browser, a DropEvent gives details on the data being dropped, as well as
      // the element that it was dropped onto.
      const dataTransfer = new DataTransfer();
      // The browser may receive multiple formats of the data, such as text/plain as well as text/html, in the same
      // drop event.
      dataTransfer.setData('text/plain', textToDropIn);
      dataTransfer.setData('text/html', `<span background="white">${textToDropIn}</span>`);
      const targetElement: Element | null = env.component.editor!.container.querySelector(
        `usx-segment[data-segment="${targetSegmentRef}"]`
      );
      const dragEvent: MockDragEvent = new MockDragEvent('drop', {
        dataTransfer,
        cancelable: true
      });
      dragEvent.setTarget(targetElement);

      // How far into the initialTextInDoc the user is trying to drop the new text
      const desiredIndexInSegment = 'target: chapter'.length;
      // Override the Chromium point-to-index method behavior, since the unit test isn't really dragging the mouse
      // to an element.
      const startContainer: Node = targetElement!.childNodes[0] as Node;
      // eslint-disable-next-line deprecation/deprecation
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: desiredIndexInSegment, startContainer } as Range);

      // SUT
      const cancelled = !env.component.editor?.container.dispatchEvent(dragEvent);
      flush();

      expect(env.component.getSegmentText(targetSegmentRef))
        .withContext('canceled drop should not have changed text')
        .toEqual(initialTextInDoc);
      expect(env.component.editor!.getText())
        .withContext('canceled dropped text should not appear in the editor')
        .not.toContain('Hello');
      expect(env.component.editor!.getText()).withContext('should be unchanged').toEqual(originalAllText);
      // event.preventDefault() should have been called to prevent the browser from doing its own drag-and-drop.
      expect(cancelled).toBeTrue();

      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) throw Error();
      expect(resultingSelection)
        .withContext('canceled drop should not have made the selection change')
        .toEqual(originalSelection);

      TestEnvironment.waitForPresenceTimer();
    }));

    // End drag-and-drop section of tests.
  });

  it('lists multiple character formatting', fakeAsync(() => {
    const chapterNum = 2;
    const originSegmentRef = `verse_${chapterNum}_1`;
    const textDocOps: RichText.DeltaOperation[] = [
      { insert: { chapter: { number: chapterNum.toString(), style: 'c' } } },
      { insert: { verse: { number: '1', style: 'v' } } },
      {
        insert: `quick brown fox`,
        attributes: {
          segment: originSegmentRef,
          char: {
            style: 'wj',
            cid: '1111'
          }
        }
      },
      {
        insert: 'jumped over',
        attributes: {
          segment: originSegmentRef,
          char: [
            {
              style: 'wj',
              cid: '1111'
            },
            {
              style: 'w',
              cid: '2222'
            }
          ]
        }
      }
    ];

    const env = new TestEnvironment({ chapterNum, textDoc: textDocOps });
    const usxCharElements: NodeListOf<Element> = env.component.editor!.container.querySelectorAll('usx-char');
    expect(usxCharElements.length).withContext('unexpected number of formatted character runs').toEqual(2);
    expect(usxCharElements[0].attributes.getNamedItem('data-style')?.value)
      .withContext('first run should just have style wj')
      .toEqual('wj');
    expect(usxCharElements[1].attributes.getNamedItem('data-style')?.value)
      .withContext('second run should have two styles')
      .toEqual('wj w');
  }));

  it('isValidSelectionForCurrentSegment', fakeAsync(() => {
    const chapterNum = 2;
    const segmentRef: string = `verse_${chapterNum}_1`;
    const nextSegmentRef: string = `verse_${chapterNum}_2`;
    const textDocOps: RichText.DeltaOperation[] = [
      { insert: { chapter: { number: chapterNum.toString(), style: 'c' } } },
      { insert: { verse: { number: '1', style: 'v' } } },
      {
        insert: `quick brown fox`,
        attributes: {
          segment: segmentRef
        }
      },
      { insert: { verse: { number: '2', style: 'v' } } },
      {
        insert: 'jumped over',
        attributes: {
          segment: nextSegmentRef
        }
      }
    ];

    const env = new TestEnvironment({ chapterNum, textDoc: textDocOps });

    env.fixture.detectChanges();
    tick();
    env.component.setSegment(segmentRef);
    tick();
    const segmentRange: RangeStatic | undefined = env.component.getSegmentRange(segmentRef);
    if (segmentRange == null) {
      fail('setup');
      return;
    }

    // Is a given selection range valid for the current segment (segmentRef)?

    const cases: { description: string; range: RangeStatic; shouldBeValid: boolean }[] = [
      { description: 'entire segment', range: segmentRange, shouldBeValid: true },
      { description: 'at first char', range: { index: segmentRange.index, length: 0 }, shouldBeValid: true },
      { description: 'at second char', range: { index: segmentRange.index + 1, length: 0 }, shouldBeValid: true },
      { description: 'over first char', range: { index: segmentRange.index, length: 1 }, shouldBeValid: true },
      { description: 'over second char', range: { index: segmentRange.index + 1, length: 1 }, shouldBeValid: true },

      {
        description: 'after last char',
        range: { index: segmentRange.index + segmentRange.length, length: 0 },
        shouldBeValid: true
      },
      {
        description: 'at last char',
        range: { index: segmentRange.index + segmentRange.length - 1, length: 0 },
        shouldBeValid: true
      },
      {
        description: 'over last char',
        range: { index: segmentRange.index + segmentRange.length - 1, length: 1 },
        shouldBeValid: true
      },

      {
        description: 'prior to first char (out of bounds)',
        range: { index: segmentRange.index - 1, length: 0 },
        shouldBeValid: false
      },
      {
        description: 'range prior to first char (out of bounds)',
        range: { index: segmentRange.index - 1, length: 1 },
        shouldBeValid: false
      },
      {
        description: 'range prior to and over first char (out of bounds)',
        range: { index: segmentRange.index - 1, length: 2 },
        shouldBeValid: false
      },

      {
        description: 'past end (out of bounds)',
        range: { index: segmentRange.index + segmentRange.length + 1, length: 0 },
        shouldBeValid: false
      },
      {
        description: 'range past end (out of bounds)',
        range: { index: segmentRange.index + segmentRange.length + 1, length: 1 },
        shouldBeValid: false
      },
      {
        description: 'range over and past end (out of bounds)',
        range: { index: segmentRange.index + segmentRange.length - 1, length: 2 },
        shouldBeValid: false
      },
      {
        description: 'range starting at and passing end (out of bounds)',
        range: { index: segmentRange.index + segmentRange.length, length: 1 },
        shouldBeValid: false
      },

      {
        description: 'before segment thru after segment (out of bounds on both sides)',
        range: { index: segmentRange.index - 1, length: segmentRange.length + 2 },
        shouldBeValid: false
      }
    ];
    cases.forEach((testCase: { description: string; range: RangeStatic; shouldBeValid: boolean }) => {
      expect((env.component as any).isValidSelectionForCurrentSegment(testCase.range))
        .withContext(testCase.description)
        .toEqual(testCase.shouldBeValid);
    });
  }));

  it('does not cancel in beforeinput when valid selection', fakeAsync(() => {
    const { env }: { env: TestEnvironment; segmentRange: RangeStatic } = basicSimpleText();

    const beforeinputEvent: InputEvent = new InputEvent('beforeinput', {
      cancelable: true
    });

    // When asked, the current selection will be called valid.
    const isValidSpy: jasmine.Spy<any> = spyOn<any>(env.component, 'isValidSelectionForCurrentSegment').and.returnValue(
      true
    );

    // SUT
    const cancelled: boolean = !env.component.editor?.container.dispatchEvent(beforeinputEvent);
    flush();

    expect(cancelled).withContext('event should not have been cancelled when valid selection').toBeFalse();
    expect(isValidSpy).withContext('the test may have worked for the wrong reason').toHaveBeenCalled();
  }));

  it('cancels in beforeinput when invalid selection', fakeAsync(() => {
    const { env }: { env: TestEnvironment; segmentRange: RangeStatic } = basicSimpleText();

    const beforeinputEvent: InputEvent = new InputEvent('beforeinput', {
      cancelable: true
    });

    // When asked, the current selection will be called invalid.
    const isValidSpy: jasmine.Spy<any> = spyOn<any>(env.component, 'isValidSelectionForCurrentSegment').and.returnValue(
      false
    );

    // SUT
    const cancelled: boolean = !env.component.editor?.container.dispatchEvent(beforeinputEvent);
    flush();

    expect(cancelled).withContext('event should have been cancelled when invalid selection').toBeTrue();
    expect(isValidSpy).withContext('the test may have worked for the wrong reason').toHaveBeenCalled();
  }));

  it('allows backspace when valid selection', fakeAsync(() => {
    const { env, segmentRange }: { env: TestEnvironment; segmentRange: RangeStatic } = basicSimpleText();

    // When asked, the current selection will be called valid.
    const isValidSpy: jasmine.Spy<any> = spyOn<any>(env.component, 'isValidSelectionForCurrentSegment').and.returnValue(
      true
    );

    // SUT
    const allowed: boolean = env.quillHandleBackspace(segmentRange);

    expect(allowed).withContext('should have been allowed when valid selection').toBeTrue();
    expect(isValidSpy).withContext('the test may have worked for the wrong reason').toHaveBeenCalled();
  }));

  it('disallows backspace when invalid selection', fakeAsync(() => {
    const { env, segmentRange }: { env: TestEnvironment; segmentRange: RangeStatic } = basicSimpleText();

    // When asked, the current selection will be called invalid.
    const isValidSpy: jasmine.Spy<any> = spyOn<any>(env.component, 'isValidSelectionForCurrentSegment').and.returnValue(
      false
    );

    // SUT
    const allowed: boolean = env.quillHandleBackspace(segmentRange);

    expect(allowed).withContext('should have been disallowed when invalid selection').toBeFalse();
    expect(isValidSpy).withContext('the test may have worked for the wrong reason').toHaveBeenCalled();
  }));

  it('can backspace a word at a time', fakeAsync(() => {
    const { env, segmentRange }: { env: TestEnvironment; segmentRange: RangeStatic } = basicSimpleText();
    let initialText = 'quick brown fox';
    let resultTexts = ['quick brown ', 'quick ', '', ''];
    env.performDeleteWordTest('backspace', segmentRange.index, initialText, resultTexts);
    TestEnvironment.waitForPresenceTimer();
  }));

  it('allows delete when valid selection', fakeAsync(() => {
    const { env, segmentRange }: { env: TestEnvironment; segmentRange: RangeStatic } = basicSimpleText();

    // When asked, the current selection will be called valid.
    const isValidSpy: jasmine.Spy<any> = spyOn<any>(env.component, 'isValidSelectionForCurrentSegment').and.returnValue(
      true
    );

    // SUT
    const allowed: boolean = env.quillHandleDelete(segmentRange);

    expect(allowed).withContext('should have been allowed when valid selection').toBeTrue();
    expect(isValidSpy).withContext('the test may have worked for the wrong reason').toHaveBeenCalled();
  }));

  it('disallows delete when invalid selection', fakeAsync(() => {
    const { env, segmentRange }: { env: TestEnvironment; segmentRange: RangeStatic } = basicSimpleText();

    // When asked, the current selection will be called invalid.
    const isValidSpy: jasmine.Spy<any> = spyOn<any>(env.component, 'isValidSelectionForCurrentSegment').and.returnValue(
      false
    );

    // SUT
    const allowed: boolean = env.quillHandleDelete(segmentRange);

    expect(allowed).withContext('should have been disallowed when invalid selection').toBeFalse();
    expect(isValidSpy).withContext('the test may have worked for the wrong reason').toHaveBeenCalled();
  }));

  it('can delete a word at a time', fakeAsync(() => {
    const { env, segmentRange }: { env: TestEnvironment; segmentRange: RangeStatic } = basicSimpleText();
    let initialText = 'quick brown fox';
    const resultTexts = [' brown fox', ' fox', '', ''];
    env.performDeleteWordTest('delete', segmentRange.index, initialText, resultTexts);
    TestEnvironment.waitForPresenceTimer();
  }));

  it('does not cancel paste when valid selection', fakeAsync(() => {
    const { env }: { env: TestEnvironment; segmentRange: RangeStatic } = basicSimpleText();

    const payload: string = 'abcd';
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', payload);
    clipboardData.setData('text/html', `<span background="white">${payload}</span>`);

    const pasteEvent: ClipboardEvent = new ClipboardEvent('paste', {
      clipboardData,
      cancelable: true
    });

    const quillUpdateContentsSpy: jasmine.Spy<any> = spyOn<any>(
      env.component.editor,
      'updateContents'
    ).and.callThrough();
    // When asked, the current selection will be called valid.
    const isValidSpy: jasmine.Spy<any> = spyOn<any>(env.component, 'isValidSelectionForCurrentSegment').and.returnValue(
      true
    );

    // I haven't been able to trigger quill's onPaste by dispatching a ClipboardEvent. So directly call it.

    // SUT
    (env.component.editor!.clipboard as any).onPaste(pasteEvent);
    flush();
    expect(pasteEvent.defaultPrevented).withContext('the quill onPaste cancels further processing').toBeTrue();

    expect(quillUpdateContentsSpy).withContext('quill is edited').toHaveBeenCalled();
    expect(isValidSpy).withContext('the test may have worked for the wrong reason').toHaveBeenCalled();

    TestEnvironment.waitForPresenceTimer();
  }));

  it('cancels paste when invalid selection', fakeAsync(() => {
    const { env }: { env: TestEnvironment; segmentRange: RangeStatic } = basicSimpleText();

    const payload: string = 'abcd';
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', payload);
    clipboardData.setData('text/html', `<span background="white">${payload}</span>`);

    const pasteEvent: ClipboardEvent = new ClipboardEvent('paste', {
      clipboardData,
      cancelable: true
    });

    const quillUpdateContentsSpy: jasmine.Spy<any> = spyOn<any>(
      env.component.editor,
      'updateContents'
    ).and.callThrough();
    // When asked, the current selection will be called invalid.
    const isValidSpy: jasmine.Spy<any> = spyOn<any>(env.component, 'isValidSelectionForCurrentSegment').and.returnValue(
      false
    );

    // I haven't been able to trigger quill's onPaste by dispatching a ClipboardEvent. So directly call it.

    // SUT
    (env.component.editor!.clipboard as any).onPaste(pasteEvent);
    flush();
    expect(pasteEvent.defaultPrevented).withContext('the quill onPaste cancels further processing').toBeTrue();

    expect(quillUpdateContentsSpy).withContext('quill contents are not modified').not.toHaveBeenCalled();
    expect(isValidSpy).withContext('the test may have worked for the wrong reason').toHaveBeenCalled();
  }));

  it('can display footnote dialog', fakeAsync(() => {
    const chapterNum = 2;
    const segmentRef: string = `verse_${chapterNum}_1`;
    const textDocOps: RichText.DeltaOperation[] = [
      { insert: { chapter: { number: chapterNum.toString(), style: 'c' } } },
      { insert: { verse: { number: '1', style: 'v' } } },
      {
        insert: `quick brown`,
        attributes: {
          segment: segmentRef
        }
      },
      {
        insert: {
          note: {
            caller: '+',
            style: 'f',
            contents: {
              ops: [
                {
                  insert: `${chapterNum}.1 `,
                  attributes: {
                    char: {
                      style: 'fe',
                      closed: 'false',
                      cid: '65efb8c9-ebf1-4ac8-abd2-20b5e067996d'
                    }
                  }
                },
                {
                  insert: 'footnote text',
                  attributes: {
                    char: {
                      style: 'ft',
                      closed: 'false',
                      cid: '6746d56a-77eb-4b72-8d38-4b87f3af32e2'
                    }
                  }
                }
              ]
            }
          }
        },
        attributes: {
          segment: segmentRef
        }
      },
      {
        insert: {
          note: {
            caller: '+',
            style: 'fe',
            contents: {
              ops: [
                {
                  insert: `${chapterNum}.1 `,
                  attributes: {
                    char: {
                      style: 'fe',
                      closed: 'false',
                      cid: '65efb8c9-ebf1-4ac8-abd2-20b5e067996d'
                    }
                  }
                },
                {
                  insert: 'end note text',
                  attributes: {
                    char: {
                      style: 'ft',
                      closed: 'false',
                      cid: '6746d56a-77eb-4b72-8d38-4b87f3af32e2'
                    }
                  }
                }
              ]
            }
          }
        },
        attributes: {
          segment: segmentRef
        }
      },
      {
        insert: {
          note: {
            caller: '+',
            style: 'x',
            contents: {
              ops: [
                {
                  insert: `${chapterNum}.1 `,
                  attributes: {
                    char: {
                      style: 'fe',
                      closed: 'false',
                      cid: '65efb8c9-ebf1-4ac8-abd2-20b5e067996d'
                    }
                  }
                },
                {
                  insert: 'cross-reference text',
                  attributes: {
                    char: {
                      style: 'ft',
                      closed: 'false',
                      cid: '6746d56a-77eb-4b72-8d38-4b87f3af32e2'
                    }
                  }
                }
              ]
            }
          }
        },
        attributes: {
          segment: segmentRef
        }
      },
      {
        insert: ` fox`,
        attributes: {
          segment: segmentRef
        }
      }
    ];
    const env = new TestEnvironment({ chapterNum, textDoc: textDocOps });
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    [TextNoteType.Footnote, TextNoteType.EndNote, TextNoteType.CrossReference].forEach(noteStyle => {
      const note = env.quillEditor.querySelector('usx-note[data-style="' + noteStyle + '"]') as HTMLElement;
      expect(note).withContext(noteStyle).not.toBeNull();
      note!.click();
    });
    verify(mockedDialogService.openMatDialog(TextNoteDialogComponent, anything())).thrice();
  }));

  it('does not match segments when verse ref is from a different chapter', fakeAsync(() => {
    const env = new TestEnvironment();
    env.id = new TextDocId('project01', 40, 1);
    tick();
    env.fixture.detectChanges();
    // the current text is on chapter 1, so this should result in no matching segments
    const verseRef: VerseRef = VerseRef.parse('MAT 2:1');
    const segments: string[] = env.component.getVerseSegments(verseRef);
    expect(segments.length).withContext('should be no matching segments when chapter does not match').toBe(0);
  }));

  it('does not match segments when verse ref is from a different book', fakeAsync(() => {
    const env = new TestEnvironment();
    env.id = new TextDocId('project01', 40, 1);
    tick();
    env.fixture.detectChanges();
    // the current text is in Matthew, so this should result in no matching segments
    const verseRef: VerseRef = VerseRef.parse('MRK 1:1');
    const segments: string[] = env.component.getVerseSegments(verseRef);
    expect(segments.length).withContext('should be no matching segments when book does not match').toBe(0);
  }));
});

/** Represents both what the TextComponent understand to be the text in a segment, and what the editor
 * understands the length to be, which includes non-text items like icons. */
interface SegmentContent {
  text: string;
  editorLength: number;
}

/** Represents a selection in the editor: Where it is, and what it contains. */
interface SelectionSpecification {
  segmentRef: string;
  text: string;
  startEditorPosInSegment: number;
  editorLength: number;
}

/** Arguments for method. */
interface PerformDropTestArgs {
  env: TestEnvironment;
  originSegmentRef: string;
  targetSegmentRef: string;
  originSegmentContentBeforeEvent: SegmentContent;
  selectionBeforeEvent: SelectionSpecification;
  targetSegmentContentBeforeEvent: SegmentContent;
  expectedOriginSegmentContentAfterEvent: SegmentContent;
  expectedTargetSegmentContentAfterEvent: SegmentContent;
  expectedSelectionAfterEvent: SelectionSpecification;
  segmentElementDropTarget: Element;
  elementDropTarget: Element;
  specificNodeDropTarget: ChildNode;
  dropDistanceIn: number;
  topLevelNodeSeriesBeforeEvent: string[];
  expectedTopLevelNodeSeriesAfterEvent: string[];
}

/** Arguments to TestEnvironment constructor. */
interface TestEnvCtorArgs {
  callback?: (env: TestEnvironment) => void;
  chapterNum?: number;
  textDoc?: RichText.DeltaOperation[];
  presenceEnabled?: boolean;
}

class MockDragEvent extends DragEvent {
  private _target: EventTarget | null = null;
  private _dataTransfer: DataTransfer | null = null;

  get target(): EventTarget | null {
    return this._target;
  }

  get dataTransfer(): DataTransfer | null {
    return this._dataTransfer;
  }

  constructor(type: string, eventInitDict?: DragEventInit | undefined) {
    super(type, eventInitDict);
    if (eventInitDict?.dataTransfer != null) {
      this.setDataTransfer(eventInitDict?.dataTransfer);
    }
  }

  public setTarget(newTarget: EventTarget | null): void {
    this._target = newTarget;
  }

  public setDataTransfer(newDataTransfer: DataTransfer | null): void {
    this._dataTransfer = newDataTransfer;
  }
}

class MockQuill extends Quill {
  getModule(name: string): any {
    if (name === 'cursors') {
      return new QuillCursors(this);
    }
  }
}

@Component({
  selector: 'app-host',
  template: `<app-text
    [placeholder]="initialPlaceHolder"
    [id]="id"
    [isRightToLeft]="isTextRightToLeft"
    [isReadOnly]="isReadOnly"
    [enablePresence]="enablePresence"
    (presenceChange)="onPresenceChange($event)"
  ></app-text>`
})
class HostComponent {
  @ViewChild(TextComponent) textComponent!: TextComponent;

  enablePresence: boolean = true;
  initialPlaceHolder = 'initial placeholder text';
  isTextRightToLeft: boolean = false;
  isReadOnly: boolean = false;
  id?: TextDocId;
  remotePresences?: RemotePresences;

  onPresenceChange(remotePresences?: RemotePresences): void {
    this.remotePresences = remotePresences;
  }
}

class TestEnvironment {
  readonly component: TextComponent;
  readonly hostComponent: HostComponent;
  readonly fixture: ComponentFixture<HostComponent>;
  realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private _onlineStatus = new BehaviorSubject<boolean>(true);
  private isOnline: boolean = true;

  constructor({ textDoc, chapterNum, presenceEnabled = true, callback }: TestEnvCtorArgs = {}) {
    when(mockedPwaService.onlineStatus$).thenReturn(this._onlineStatus.asObservable());
    when(mockedPwaService.isOnline).thenCall(() => this.isOnline);
    when(mockedTranslocoService.translate<string>(anything())).thenCall(
      (translationStringKey: string) => translationStringKey
    );

    const matTextDocId = new TextDocId('project01', 40, 1);
    const mrkTextDocId = new TextDocId('project01', 41, 1);
    const lukTextDocId = new TextDocId('project01', 42, 1);
    const jhnTextDocId = new TextDocId('project01', 43, 1);
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project01',
      data: createTestProjectProfile({
        userRoles: { user01: SFProjectRole.ParatextTranslator, user02: SFProjectRole.ParatextConsultant },
        checkingConfig: {
          checkingEnabled: false,
          shareEnabled: true
        },
        texts: [
          {
            bookNum: 40,
            chapters: [
              { number: 1, lastVerse: 3, isValid: true, permissions: {} },
              { number: 2, lastVerse: 3, isValid: true, permissions: {} }
            ],
            hasSource: true,
            permissions: {}
          }
        ]
      })
    });
    this.realtimeService.addSnapshots<TextData>(TextDoc.COLLECTION, [
      {
        id: matTextDocId.toString(),
        data: getTextDoc(matTextDocId),
        type: RichText.type.name
      },
      {
        id: mrkTextDocId.toString(),
        data: getCombinedVerseTextDoc(mrkTextDocId),
        type: RichText.type.name
      },
      {
        id: lukTextDocId.toString(),
        data: getPoetryVerseTextDoc(lukTextDocId),
        type: RichText.type.name
      },
      { id: jhnTextDocId.toString(), data: getEmptyChapterDoc(jhnTextDocId), type: RichText.type.name }
    ]);
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: 'user01',
      data: createTestUser({}, 1)
    });

    when(mockedProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );
    when(mockedProjectService.getProfile(anything())).thenCall(() =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, 'project01')
    );
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, 'user01')
    );

    if (callback != null) {
      callback(this);
    }

    this.fixture = TestBed.createComponent(HostComponent);
    this.fixture.detectChanges();
    this.component = this.fixture.componentInstance.textComponent;
    this.hostComponent = this.fixture.componentInstance;

    this.hostComponent.enablePresence = presenceEnabled;

    if (textDoc != null && chapterNum != null) {
      const textDocId: TextDocId = new TextDocId('project01', 40, chapterNum);
      const delta = new Delta(textDoc);
      this.realtimeService.addSnapshot<TextData>(TextDoc.COLLECTION, {
        id: textDocId.toString(),
        data: delta,
        type: RichText.type.name
      });
      this.id = textDocId;
    }

    tick();
    this.fixture.detectChanges();
  }

  static waitForPresenceTimer(): void {
    tick(PRESENCE_EDITOR_ACTIVE_TIMEOUT);
  }

  set id(value: TextDocId) {
    this.hostComponent.id = value;
    tick();
    this.fixture.detectChanges();
  }

  set onlineStatus(value: boolean) {
    this.isOnline = value;
    tick();
    this._onlineStatus.next(value);
    tick();
    this.fixture.detectChanges();
  }

  get quillEditor(): HTMLElement {
    return document.getElementsByClassName('ql-container')[0] as HTMLElement;
  }

  get remoteChannelPresences(): Record<string, PresenceData> {
    return (this.component as any).presenceChannel.remotePresences;
  }

  get remoteDocPresences(): Record<string, RangeStatic | null> {
    return (this.component as any).presenceDoc.remotePresences;
  }

  get localPresenceChannel(): LocalPresence<PresenceData> {
    return (this.component as any).localPresenceChannel;
  }

  get localPresenceDoc(): LocalPresence<RangeStatic | null> {
    return (this.component as any).localPresenceDoc;
  }

  getUserDoc(userId: string): UserDoc {
    return this.realtimeService.get<UserDoc>(UserDoc.COLLECTION, userId);
  }

  getSegment(segmentRef: string): HTMLElement | null {
    return this.quillEditor.querySelector(`usx-segment[data-segment="${segmentRef}"]`);
  }

  isSegmentHighlighted(chapter: number, verse: number | string): boolean {
    const segment = this.quillEditor.querySelector(`usx-segment[data-segment="verse_${chapter}_${verse}"]`)!;
    return segment != null && segment.classList.contains('highlight-segment');
  }

  insertText(index: number, text: string): void {
    this.component.editor!.insertText(index, text, 'user');
    tick();
    this.fixture.detectChanges();
  }

  embedNoteAtVerse(verse: number): void {
    const textAnchor: TextAnchor = { start: 8, length: 7 };
    this.embedThreadAt(`MAT 1:${verse}`, textAnchor);
  }

  /** Where reference is like 'MAT 1:2'. */
  embedThreadAt(reference: string, textAnchor: TextAnchor, role: string = SFProjectRole.ParatextTranslator): void {
    const verseRef: VerseRef = VerseRef.parse(reference);
    const uniqueSuffix: string = Math.random().toString();
    const id: string = `embedid${reference}${uniqueSuffix}`;
    const iconSource: string = '--icon-file: url(/assets/icons/TagIcons/01flag1.png)';
    const text: string = `text message on ${id}`;
    const format = { iconsrc: iconSource, preview: text, threadid: id };
    this.component.embedElementInline(verseRef, id, role, textAnchor, 'note-thread-embed', format);
    this.component.toggleFeaturedVerseRefs(true, [verseRef], 'note-thread');
  }

  /** Helper method to perform a drag-and-drop and check expectations on resulting data, elements, and
   *  editor selection. */
  performDropTest({
    env,
    originSegmentRef,
    targetSegmentRef,
    originSegmentContentBeforeEvent,
    selectionBeforeEvent,
    targetSegmentContentBeforeEvent,
    expectedOriginSegmentContentAfterEvent,
    expectedTargetSegmentContentAfterEvent,
    expectedSelectionAfterEvent,
    elementDropTarget,
    segmentElementDropTarget,
    specificNodeDropTarget,
    dropDistanceIn,
    topLevelNodeSeriesBeforeEvent,
    expectedTopLevelNodeSeriesAfterEvent
  }: PerformDropTestArgs): void {
    this.assertNodeOrder(segmentElementDropTarget, topLevelNodeSeriesBeforeEvent);

    expect(env.component.getSegmentText(originSegmentRef))
      .withContext('setup')
      .toEqual(originSegmentContentBeforeEvent.text);
    expect(env.component.getSegmentText(targetSegmentRef))
      .withContext('setup')
      .toEqual(targetSegmentContentBeforeEvent.text);

    const originSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(selectionBeforeEvent.segmentRef);
    if (originSegmentRange == null) {
      throw Error();
    }
    const selectionStart: number = originSegmentRange.index + selectionBeforeEvent.startEditorPosInSegment;
    const selectionLength: number = selectionBeforeEvent.editorLength;
    env.component.editor?.setSelection(selectionStart, selectionLength);

    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', selectionBeforeEvent.text);
    dataTransfer.setData('text/html', `<span background="white">${selectionBeforeEvent.text}</span>`);
    const dropEvent: MockDragEvent = new MockDragEvent('drop', {
      dataTransfer,
      cancelable: true
    });
    dropEvent.setTarget(elementDropTarget);

    // eslint-disable-next-line deprecation/deprecation
    document.caretRangeFromPoint = (_x: number, _y: number) =>
      ({ startOffset: dropDistanceIn, startContainer: specificNodeDropTarget as Node } as Range);

    const dragstartEvent: MockDragEvent = new MockDragEvent('dragstart', {
      dataTransfer,
      cancelable: true
    });
    env.component.editor?.container.dispatchEvent(dragstartEvent);
    tick();

    // SUT
    const cancelled: boolean = !env.component.editor?.container.dispatchEvent(dropEvent);
    flush();

    expect(cancelled).withContext('should cancel browser acting').toBeTrue();
    expect(env.component.getSegmentText(originSegmentRef))
      .withContext('origin segment should be changed as expected')
      .toEqual(expectedOriginSegmentContentAfterEvent.text);
    expect(env.component.getSegmentText(targetSegmentRef))
      .withContext('target segment should be changed as expected')
      .toEqual(expectedTargetSegmentContentAfterEvent.text);

    const targetSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(
      expectedSelectionAfterEvent.segmentRef
    );
    if (targetSegmentRange == null) {
      throw Error();
    }
    const desiredSelectionStart = targetSegmentRange.index + expectedSelectionAfterEvent.startEditorPosInSegment;
    const desiredSelectionLength = expectedSelectionAfterEvent.editorLength;
    const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
    if (resultingSelection == null) {
      throw Error();
    }

    // After text is dragged, the new selection should be the inserted text.
    expect(resultingSelection.index).toEqual(desiredSelectionStart);
    expect(resultingSelection.length).toEqual(desiredSelectionLength);

    this.assertNodeOrder(segmentElementDropTarget, expectedTopLevelNodeSeriesAfterEvent);
  }

  performDeleteWordTest(
    type: 'backspace' | 'delete',
    segmentStartIndex: number,
    initialText: string,
    resultTexts: string[]
  ): void {
    for (let i = 0; i < resultTexts.length; i++) {
      let content = this.component.editor!.getContents();
      expect(content.ops!.length).toEqual(4);
      expect(content.ops![1].insert!.verse.number).toEqual('1');
      expect(this.component.getSegmentText('verse_2_1')).toEqual(initialText);

      const blankSegmentLength = 1;
      let selectionIndex: number = segmentStartIndex;
      if (type === 'backspace') {
        selectionIndex += initialText.length === 0 ? blankSegmentLength : initialText.length;
        // put the selection at the end of the segment
        const selection: RangeStatic = { index: selectionIndex, length: 0 };
        this.quillWordDeletion(type, selection);
      } else {
        // put the selection at the beginning of the segment
        selectionIndex += initialText.length === 0 ? blankSegmentLength : 0;
        const selection: RangeStatic = { index: selectionIndex, length: 0 };
        this.quillWordDeletion(type, selection);
      }
      tick();
      this.fixture.detectChanges();

      content = this.component.editor!.getContents();
      expect(content.ops!.length).toEqual(4);
      expect(content.ops![1].insert!.verse.number).toEqual('1');
      expect(this.component.getSegmentText('verse_2_1')).toEqual(resultTexts[i]);
      initialText = resultTexts[i];
    }
  }

  /** Write a presence into the sharedb remote presence list, and notify that a new remote presence has
   * appeared on the textdoc. */
  addRemotePresence(remotePresenceId: string, range?: RangeStatic | null): void {
    const presenceData: PresenceData = {
      viewer: {
        activeInEditor: false,
        avatarUrl: '',
        cursorColor: '',
        displayName: remotePresenceId
      }
    };
    if (range == null) {
      range = mock<RangeStatic>();
    }
    // Write the presence right into the area that would be being provided by the sharedb.
    this.remoteChannelPresences[remotePresenceId] = presenceData;
    this.remoteDocPresences[remotePresenceId] = range;
    // A remote presence is learned about.
    (this.component as any).onPresenceDocReceive(remotePresenceId, range);
    (this.component as any).onPresenceChannelReceive(remotePresenceId, presenceData);
    tick(400);
  }

  /** Dispatching a 'keydown' KeyboardEvent in the test doesn't seem to
   * trigger the quill backspace handler. Crudely go find the desired handler
   * method in quill keyboard's list of handlers for backspace and call it.
   * */
  quillHandleBackspace(range: RangeStatic): boolean {
    const backspaceKeyCode = 8;
    const matchingBindings = (this.component.editor!.keyboard as any).bindings[backspaceKeyCode].filter(
      (bindingItem: any) => bindingItem.handler.toString().includes('isBackspaceAllowed')
    );
    expect(matchingBindings.length)
      .withContext('setup: should be grabbing a single, specific binding in quill with the desired handler')
      .toEqual(1);
    return matchingBindings[0].handler(range);
  }

  /** Crudely find backspace or delete word handler. */
  quillWordDeletion(type: 'backspace' | 'delete', range: RangeStatic): void {
    let keyCode = 8;
    let handler = 'handleBackspaceWord';
    if (type === 'delete') {
      keyCode = 46;
      handler = 'handleDeleteWord';
    }
    const matchingBindings = (this.component.editor!.keyboard as any).bindings[keyCode].filter((bindingItem: any) =>
      bindingItem.handler.toString().includes(handler)
    );
    expect(matchingBindings.length)
      .withContext('setup: should be grabbing a single, specific binding in quill with the desired handler')
      .toEqual(1);
    return matchingBindings[0].handler(range);
  }

  /** Crudely go find the desired handler
   * method in quill keyboard's list of handlers for delete and call it.
   * */
  quillHandleDelete(range: RangeStatic): boolean {
    const deleteKeyCode = 46;
    const matchingBindings = (this.component.editor!.keyboard as any).bindings[deleteKeyCode].filter(
      (bindingItem: any) => bindingItem.handler.toString().includes('isDeleteAllowed')
    );
    expect(matchingBindings.length)
      .withContext('setup: should be grabbing a single, specific binding in quill with the desired handler')
      .toEqual(1);
    return matchingBindings[0].handler(range);
  }

  triggerUndo(): void {
    this.component.editor!.history.undo();
    tick();
    this.fixture.detectChanges();
  }

  /** Assert that in `parentNode`, there are only immediate children with name and order specified in
   * `nodeOrderings`. */
  private assertNodeOrder(parentNode: Node, nodeOrderings: string[]): void {
    const childNodes: string[] = Array.from(parentNode.childNodes).map((n: ChildNode) => n.nodeName.toLowerCase());
    expect(childNodes)
      .withContext(`not expected list of nodes: [${childNodes}] does not match expected [${nodeOrderings}]`)
      .toEqual(nodeOrderings);
  }
}

function basicSimpleText(): { env: TestEnvironment; segmentRange: RangeStatic } {
  const chapterNum = 2;
  const segmentRef: string = `verse_${chapterNum}_1`;
  const textDocOps: RichText.DeltaOperation[] = [
    { insert: { chapter: { number: chapterNum.toString(), style: 'c' } } },
    { insert: { verse: { number: '1', style: 'v' } } },
    {
      insert: `quick brown fox`,
      attributes: {
        segment: segmentRef
      }
    }
  ];

  const env = new TestEnvironment({ chapterNum, textDoc: textDocOps });

  env.fixture.detectChanges();
  tick();
  env.component.setSegment(segmentRef);
  tick();
  const segmentRange: RangeStatic | undefined = env.component.getSegmentRange(segmentRef);
  if (segmentRange == null) {
    fail('setup: problem with segment ref');
    throw Error();
  }
  // Select the segment text.
  env.component.editor?.setSelection(segmentRange.index, segmentRange.length);
  env.fixture.detectChanges();
  tick();
  return { env, segmentRange };
}
