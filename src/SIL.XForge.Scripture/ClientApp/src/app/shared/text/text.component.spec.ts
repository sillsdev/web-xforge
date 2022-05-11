import { CommonModule } from '@angular/common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { TranslocoService } from '@ngneat/transloco';
import Quill, { RangeStatic } from 'quill';
import QuillCursors from 'quill-cursors';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TextAnchor } from 'realtime-server/lib/esm/scriptureforge/models/text-anchor';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import * as RichText from 'rich-text';
import { BehaviorSubject, Subscription } from 'rxjs';
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
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { Delta, TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { SharedModule } from '../shared.module';
import { getCombinedVerseTextDoc, getSFProject, getTextDoc } from '../test-utils';
import { DragAndDrop } from './drag-and-drop';
import { TextComponent } from './text.component';
import { PresenceData, RemotePresences } from './text-view-model';

const mockedBugsnagService = mock(BugsnagService);
const mockedPwaService = mock(PwaService);
const mockedProjectService = mock(SFProjectService);
const mockedTranslocoService = mock(TranslocoService);
const mockedUserService = mock(UserService);
const mockedConsole: MockConsole = MockConsole.install();

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
      { provide: UserService, useMock: mockedUserService }
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

  describe('MultiCursor Presence', () => {
    it('should not update presence if something other than the user moves the cursor', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();
      const onSelectionChangedSpy = spyOn<any>(env.component, 'onSelectionChanged').and.callThrough();
      const localPresenceSubmitSpy = spyOn<any>(env.component.localPresence, 'submit').and.callThrough();

      env.component.editor?.setSelection(1, 1, 'api');

      tick();
      expect(onSelectionChangedSpy).toHaveBeenCalledTimes(1);
      expect(localPresenceSubmitSpy).toHaveBeenCalledTimes(0);
      verify(mockedUserService.getCurrentUser()).never();
    }));

    it('should update presence if the user moves the cursor', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();
      const onSelectionChangedSpy = spyOn<any>(env.component, 'onSelectionChanged').and.callThrough();
      const localPresenceSubmitSpy = spyOn<any>(env.component.localPresence, 'submit').and.callThrough();

      env.component.editor?.setSelection(1, 1, 'user');

      tick();
      expect(onSelectionChangedSpy).toHaveBeenCalledTimes(1);
      expect(localPresenceSubmitSpy).toHaveBeenCalledTimes(1);
      verify(mockedUserService.getCurrentUser()).once();
    }));

    it('should clear presence on blur', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();
      const onSelectionChangedSpy = spyOn<any>(env.component, 'onSelectionChanged').and.callThrough();
      const localPresenceSubmitSpy = spyOn<any>(env.component.localPresence, 'submit').and.callThrough();

      env.component.onSelectionChanged({ index: 0, length: 0 }, 'user');

      tick();
      expect(onSelectionChangedSpy).toHaveBeenCalledTimes(1);
      expect(localPresenceSubmitSpy).toHaveBeenCalledTimes(1);
      verify(mockedUserService.getCurrentUser()).once();

      env.component.onSelectionChanged(null as unknown as RangeStatic, 'user');

      tick();
      expect(onSelectionChangedSpy).toHaveBeenCalledTimes(2);
      expect(localPresenceSubmitSpy).toHaveBeenCalledTimes(2);
      verify(mockedUserService.getCurrentUser()).once();
    }));

    it('should use "Anonymous" when the displayName is undefined', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();
      when(mockedUserService.getCurrentUser()).thenResolve({ data: undefined } as UserDoc);

      env.component.onSelectionChanged({ index: 0, length: 0 }, 'user');

      tick();
      verify(mockedUserService.getCurrentUser()).once();
      verify(mockedTranslocoService.translate('editor.anonymous')).once();
      expect().nothing();
    }));

    it('should emit on blur', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();
      const onSelectionChangedSpy = spyOn<any>(env.component, 'onSelectionChanged').and.callThrough();
      const localPresenceSubmitSpy = spyOn<any>(env.component.localPresence, 'submit').and.callFake(
        // This is not strictly what happens as the other user would receive the presence change that this user makes.
        (presenceData: PresenceData) => {
          (env.component as any).viewModel.onPresenceReceive('presenceId1', presenceData);
        }
      );
      expect(env.hostComponent.remotePresences).withContext('setup').toBeUndefined();

      env.component.onSelectionChanged(null as unknown as RangeStatic, 'user');

      tick();
      expect(onSelectionChangedSpy).toHaveBeenCalledTimes(1);
      expect(localPresenceSubmitSpy).toHaveBeenCalledTimes(1);
      verify(mockedUserService.getCurrentUser()).never();
      expect(env.hostComponent.remotePresences).toBeDefined();
    }));

    it('should emit on cursor move', fakeAsync(() => {
      const env: TestEnvironment = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.fixture.detectChanges();
      const onSelectionChangedSpy = spyOn<any>(env.component, 'onSelectionChanged').and.callThrough();
      const localPresenceSubmitSpy = spyOn<any>(env.component.localPresence, 'submit').and.callFake(
        // This is not strictly what happens as the other user would receive the presence change that this user makes.
        (presenceData: PresenceData) => {
          (env.component as any).viewModel.onPresenceReceive('presenceId1', presenceData);
        }
      );
      expect(env.hostComponent.remotePresences).withContext('setup').toBeUndefined();

      env.component.onSelectionChanged({ index: 0, length: 0 }, 'user');

      tick();
      expect(onSelectionChangedSpy).toHaveBeenCalledTimes(1);
      expect(localPresenceSubmitSpy).toHaveBeenCalledTimes(1);
      verify(mockedUserService.getCurrentUser()).once();
      expect(env.hostComponent.remotePresences).toBeDefined();
    }));
  });

  describe('drag-and-drop', () => {
    it('inserts externally introduced data in the right place, without formatting or line breaks', fakeAsync(() => {
      // In this situation, 'external' includes text from another application, another browser window, or text in the
      // same SF web page but outside of the text area.
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      const initialTextInDoc = 'target: chapter 1, verse 4.';
      const textToDropIn = 'Hello\nHello\r\nHello';
      const expectedFinalText = 'target: chapterHello Hello Hello 1, verse 4.';
      const targetSegmentRef: string = 'verse_1_4';
      expect(env.component.getSegmentText(targetSegmentRef)).withContext('setup').toEqual(initialTextInDoc);
      expect(env.component.editor!.getText()).withContext('setup').toContain(initialTextInDoc);

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

      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(expectedFinalText);
      expect(env.component.editor?.getText()).toContain(expectedFinalText);
      // event.preventDefault() should have been called to prevent the browser from also causing a drag-and-drop to
      // happen, carrying in formatting.
      expect(cancelled).toBeTrue();

      const originSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (originSegmentRange == null) {
        throw Error();
      }
      const desiredSelectionStart = originSegmentRange.index + 'target: chapter'.length;
      const desiredSelectionLength = 'Hello Hello Hello'.length;
      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) {
        throw Error();
      }
      // After text is dragged into the document, set the selection to the inserted text.
      expect(resultingSelection.index).toEqual(desiredSelectionStart);
      expect(resultingSelection.length).toEqual(desiredSelectionLength);
    }));

    it('inserts externally introduced data in the right place, accounting for embeds', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.embedNoteAtVerse(4);
      tick();
      const initialTextInDoc = 'target: chapter 1, verse 4.';
      //       This part is anchored to ^^^^^^^
      //                                           ^ insert here
      const textToDropIn = 'Hello';
      const expectedFinalText = 'target: chapter 1, Helloverse 4.';
      const targetSegmentRef: string = 'verse_1_4';
      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(initialTextInDoc, 'setup');
      expect(env.component.editor!.getText()).toContain(initialTextInDoc, 'setup');

      const dataTransfer = new DataTransfer();
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

      const startContainer: Node = targetElement!.childNodes[2] as Node;
      // The text in the text node that is dropped into, leading up to the place of insertion. This text node is
      // after the text spanned by the note anchor.
      const dropTextNodeBeginningText: string = ` 1, `;
      // The length into this text node that will be returned by caretRangeFromPoint
      const textNodeIndex: number = dropTextNodeBeginningText.length;
      // eslint-disable-next-line deprecation/deprecation
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: textNodeIndex, startContainer } as Range);

      // SUT
      env.component.editor?.container.dispatchEvent(dragEvent);
      flush();

      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(expectedFinalText);
      expect(env.component.editor?.getText()).toContain(expectedFinalText);

      const originSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (originSegmentRange == null) {
        throw Error();
      }
      const desiredSelectionStart = originSegmentRange.index + 'target: $chapter 1, '.length;
      const desiredSelectionLength = 'Hello'.length;
      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) {
        throw Error();
      }
      // After text is dragged into the document, set the selection to the inserted text.
      expect(resultingSelection.index).toEqual(desiredSelectionStart);
      expect(resultingSelection.length).toEqual(desiredSelectionLength);
    }));

    it('also works in Firefox: inserts externally introduced data in the right place, without formatting or line breaks', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      const initialTextInDoc = 'target: chapter 1, verse 4.';
      const textToDropIn = 'Hello\nHello\r\nHello';
      const expectedFinalText = 'target: chapterHello Hello Hello 1, verse 4.';
      const targetSegmentRef: string = 'verse_1_4';
      expect(env.component.getSegmentText(targetSegmentRef)).withContext('setup').toEqual(initialTextInDoc);
      expect(env.component.editor!.getText()).withContext('setup').toContain(initialTextInDoc);

      const dataTransfer = new DataTransfer();
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

      const desiredIndexInSegment = 'target: chapter'.length;
      // Override the Firefox point-to-index method behaviour to simulate actually pointing to a location
      // when dropping.
      const offsetNode: Node = targetElement!.childNodes[0] as Node;
      document.caretPositionFromPoint = (_x: number, _y: number) =>
        ({ offset: desiredIndexInSegment, offsetNode } as CaretPosition);
      // Remove the Chromium point-to-index method so the Firefox one will be used (in our Chromium test runner).
      (document as any).caretRangeFromPoint = undefined;

      // SUT
      const cancelled = !env.component.editor?.container.dispatchEvent(dragEvent);
      flush();

      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(expectedFinalText);
      expect(env.component.editor?.getText()).toContain(expectedFinalText);
      expect(cancelled).toBeTrue();

      const originSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (originSegmentRange == null) {
        throw Error();
      }
      const desiredSelectionStart = originSegmentRange.index + 'target: chapter'.length;
      const desiredSelectionLength = 'Hello Hello Hello'.length;
      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) {
        throw Error();
      }
      expect(resultingSelection.index).toEqual(desiredSelectionStart);
      expect(resultingSelection.length).toEqual(desiredSelectionLength);
    }));

    it('also works for Firefox: inserts externally introduced data in the right place, accounting for embeds', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.embedNoteAtVerse(4);
      tick();
      const initialTextInDoc = 'target: chapter 1, verse 4.';
      const textToDropIn = 'Hello';
      const expectedFinalText = 'target: chapter 1, Helloverse 4.';
      const targetSegmentRef: string = 'verse_1_4';
      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(initialTextInDoc, 'setup');
      expect(env.component.editor!.getText()).toContain(initialTextInDoc, 'setup');

      const dataTransfer = new DataTransfer();
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

      // The text in the text node that is dropped into, leading up to the place of insertion. This text node is
      // after the text spanned by the note anchor.
      const dropTextNodeBeginningText: string = ` 1, `;
      // The length into this text node that will be returned by the browser.
      const textNodeIndex: number = dropTextNodeBeginningText.length;
      // Override the Firefox point-to-index method behaviour to simulate actually pointing to a location
      // when dropping.
      const offsetNode: Node = targetElement!.childNodes[2] as Node;
      document.caretPositionFromPoint = (_x: number, _y: number) =>
        ({ offset: textNodeIndex, offsetNode } as CaretPosition);
      // Remove the Chromium point-to-index method so the Firefox one will be used (in our Chromium test runner).
      (document as any).caretRangeFromPoint = undefined;

      // SUT
      const cancelled = !env.component.editor?.container.dispatchEvent(dragEvent);
      flush();

      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(expectedFinalText);
      expect(env.component.editor?.getText()).toContain(expectedFinalText);
      expect(cancelled).toBeTrue();

      const originSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (originSegmentRange == null) {
        throw Error();
      }
      const desiredSelectionStart = originSegmentRange.index + 'target: $chapter 1, '.length;
      const desiredSelectionLength = 'Hello'.length;
      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) {
        throw Error();
      }
      expect(resultingSelection.index).toEqual(desiredSelectionStart);
      expect(resultingSelection.length).toEqual(desiredSelectionLength);
    }));

    it('moves drag-and-drop selection in doc', fakeAsync(() => {
      // If the user selects text in the text editing area and drags it, remove it from its current location and insert
      // it into the new location.
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      const initialTextInDoc = 'target: chapter 1, verse 4.';
      //                                ---------     ^
      const textToMove = 'chapter 1';
      const expectedFinalText = 'target: , verchapter 1se 4.';
      //                                      ---------
      const targetSegmentRef: string = 'verse_1_4';
      expect(env.component.getSegmentText(targetSegmentRef)).withContext('setup').toEqual(initialTextInDoc);
      expect(env.component.editor!.getText()).withContext('setup').toContain(initialTextInDoc);

      const originSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (originSegmentRange == null) {
        throw Error();
      }
      // Location of textToMove in the editor's complete text.
      const selectionStart: number = originSegmentRange.index + 'target: '.length;
      const selectionLength: number = textToMove.length;
      env.component.editor?.setSelection(selectionStart, selectionLength);

      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', textToMove);
      dataTransfer.setData('text/html', `<span background="white">${textToMove}</span>`);
      const targetElement: Element | null = env.component.editor!.container.querySelector(
        `usx-segment[data-segment="${targetSegmentRef}"]`
      );
      const dropEvent: MockDragEvent = new MockDragEvent('drop', {
        dataTransfer,
        cancelable: true
      });
      dropEvent.setTarget(targetElement);

      // How far into the initialTextInDoc the user is trying to drop the text
      const desiredIndexInSegment = 'target: chapter 1, ver'.length;
      // Override the point-to-index method behaviour, since the unit test isn't really dragging the mouse to an
      // element.
      const startContainer: Node = targetElement!.childNodes[0] as Node;
      // eslint-disable-next-line deprecation/deprecation
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: desiredIndexInSegment, startContainer } as Range);

      const dragstartEvent: MockDragEvent = new MockDragEvent('dragstart', {
        dataTransfer,
        cancelable: true
      });

      // Setup. The drag-and-drop activity should not start out with the custom note on the event objects.
      expect(dragstartEvent.dataTransfer?.types.includes(DragAndDrop.quillIsSourceToken)).toBeFalse();
      expect(DragAndDrop.quillIsSourceToken.length).withContext('setup').toBeGreaterThan(0);

      // SUT 1
      env.component.editor?.container.dispatchEvent(dragstartEvent);
      tick();

      // A custom note should have been inserted that the drag-and-drop activity in question was started from quill,
      // and thus not from outside the text doc or from another window. This will help us know what to do with an
      // existing selection later.
      expect(dragstartEvent.dataTransfer?.types.includes(DragAndDrop.quillIsSourceToken)).toBeTrue();
      // Be prepared for the next steps, where this custom indication should be present on the drop event as well.
      expect(dropEvent.dataTransfer?.types.includes(DragAndDrop.quillIsSourceToken)).toBeTrue();

      // SUT 2
      env.component.editor?.container.dispatchEvent(dropEvent);
      flush();

      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(expectedFinalText);
      expect(env.component.editor?.getText()).toContain(expectedFinalText);

      const desiredSelectionStart = originSegmentRange.index + 'target: , ver'.length;
      const desiredSelectionLength = textToMove.length;
      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) {
        throw Error();
      }
      // After text is dragged from one place in the document to another place, the selection should be on the moved
      // text.
      expect(resultingSelection.index).toEqual(desiredSelectionStart);
      expect(resultingSelection.length).toEqual(desiredSelectionLength);
    }));

    it('moves drag-and-drop selection in doc when dragged to earlier in segment', fakeAsync(() => {
      // If the user selects text in the text editing area and drags it, remove it from its current location and insert
      // it into the new location. This should still work when dragging to a location earlier in the same segment.
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      const initialTextInDoc = 'target: chapter 1, verse 4.';
      //                           ^    ---------
      const textToMove = 'chapter 1';
      const expectedFinalText = 'tarchapter 1get: , verse 4.';
      //              New location: ---------
      const targetSegmentRef: string = 'verse_1_4';
      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(initialTextInDoc, 'setup');
      expect(env.component.editor!.getText()).toContain(initialTextInDoc, 'setup');

      const originSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (originSegmentRange == null) {
        throw Error();
      }
      // Location of textToMove in the editor's complete text.
      const selectionStart: number = originSegmentRange.index + 'target: '.length;
      const selectionLength: number = textToMove.length;
      env.component.editor?.setSelection(selectionStart, selectionLength);

      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', textToMove);
      dataTransfer.setData('text/html', `<span background="white">${textToMove}</span>`);
      const targetElement: Element | null = env.component.editor!.container.querySelector(
        `usx-segment[data-segment="${targetSegmentRef}"]`
      );
      const dropEvent: MockDragEvent = new MockDragEvent('drop', {
        dataTransfer,
        cancelable: true
      });
      dropEvent.setTarget(targetElement);

      // How far into the initialTextInDoc the user is trying to drop the text
      const desiredIndexInSegment = 'tar'.length;
      // Override the point-to-index method behaviour, since the unit test isn't really dragging the mouse to an
      // element.
      const startContainer: Node = targetElement!.childNodes[0] as Node;
      // eslint-disable-next-line deprecation/deprecation
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: desiredIndexInSegment, startContainer } as Range);

      const dragstartEvent: MockDragEvent = new MockDragEvent('dragstart', {
        dataTransfer,
        cancelable: true
      });

      env.component.editor?.container.dispatchEvent(dragstartEvent);
      tick();

      // SUT
      env.component.editor?.container.dispatchEvent(dropEvent);
      flush();

      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(expectedFinalText);
      expect(env.component.editor?.getText()).toContain(expectedFinalText);

      const desiredSelectionStart = originSegmentRange.index + 'tar'.length;
      const desiredSelectionLength = textToMove.length;
      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) {
        throw Error();
      }
      // After text is dragged from one place in the document to another place, the selection should be on the moved
      // text.
      expect(resultingSelection.index).toEqual(desiredSelectionStart);
      expect(resultingSelection.length).toEqual(desiredSelectionLength);
    }));

    it('copies drag-and-drop if user holds ctrl key', fakeAsync(() => {
      // If the user selects text in the text editing area, holds the ctrl key, and drags the text selection, keep it
      // in its current location and insert it into the new location.
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      const initialTextInDoc = 'target: chapter 1, verse 4.';
      //                                ---------     ^
      const textToMove = 'chapter 1';
      const expectedFinalText = 'target: chapter 1, verchapter 1se 4.';
      //                                               ---------
      const targetSegmentRef: string = 'verse_1_4';
      expect(env.component.getSegmentText(targetSegmentRef)).withContext('setup').toEqual(initialTextInDoc);
      expect(env.component.editor!.getText()).withContext('setup').toContain(initialTextInDoc);

      const originSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (originSegmentRange == null) {
        throw Error();
      }
      // Location of textToMove in the editor's complete text.
      const selectionStart: number = originSegmentRange.index + 'target: '.length;
      const selectionLength: number = textToMove.length;
      env.component.editor?.setSelection(selectionStart, selectionLength);

      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', textToMove);
      dataTransfer.setData('text/html', `<span background="white">${textToMove}</span>`);
      const targetElement: Element | null = env.component.editor!.container.querySelector(
        `usx-segment[data-segment="${targetSegmentRef}"]`
      );
      const dropEvent: MockDragEvent = new MockDragEvent('drop', {
        dataTransfer,
        cancelable: true,
        // User is holding ctrl key to copy.
        ctrlKey: true
      });
      dropEvent.setTarget(targetElement);

      // How far into the initialTextInDoc the user is trying to drop the text
      const desiredIndexInSegment = 'target: chapter 1, ver'.length;
      // Override the point-to-index method behaviour, since the unit test isn't really dragging the mouse to an
      // element.
      const startContainer: Node = targetElement!.childNodes[0] as Node;
      // eslint-disable-next-line deprecation/deprecation
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: desiredIndexInSegment, startContainer } as Range);

      const dragstartEvent: MockDragEvent = new MockDragEvent('dragstart', {
        dataTransfer,
        cancelable: true
      });

      // Setup. The drag-and-drop activity should not start out with the custom note on the event objects.
      expect(dragstartEvent.dataTransfer?.types.includes(DragAndDrop.quillIsSourceToken)).toBeFalse();
      expect(DragAndDrop.quillIsSourceToken.length).withContext('setup').toBeGreaterThan(0);

      // SUT 1
      env.component.editor?.container.dispatchEvent(dragstartEvent);
      tick();

      // A custom note should have been inserted that the drag-and-drop activity in question was started from quill,
      // and thus not from outside the text doc or from another window. This can help us know what to do with an
      // existing selection later.
      expect(dragstartEvent.dataTransfer?.types.includes(DragAndDrop.quillIsSourceToken)).toBeTrue();
      // Be prepared for the next steps, where this custom indication should be present on the drop event as well.
      expect(dropEvent.dataTransfer?.types.includes(DragAndDrop.quillIsSourceToken)).toBeTrue();

      // SUT 2
      env.component.editor?.container.dispatchEvent(dropEvent);
      flush();

      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(expectedFinalText);
      expect(env.component.editor?.getText()).toContain(expectedFinalText);

      const textLeadingUpToInsertionPosition = 'target: chapter 1, ver';
      const desiredSelectionStart = originSegmentRange.index + textLeadingUpToInsertionPosition.length;
      const desiredSelectionLength = textToMove.length;
      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) {
        throw Error();
      }
      // After text is ctrl-dragged from one place in the document to another place, the selection should be on the
      // copied text.
      expect(resultingSelection.index).toEqual(desiredSelectionStart);
      expect(resultingSelection.length).toEqual(desiredSelectionLength);
    }));

    it('does not remove selected text if it is not the text being dragged', fakeAsync(() => {
      // If a user selects text in the editing area, then selects text in another application and drags it into the SF
      // text area, SF should not remove the text that was selected in SF but rather leave it be.
      // Further, the text that is inserted into the document as a result of a drag operation from another application
      // should be the data that is being dragged, not necessarily the text that was selected in the text doc.
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      const initialTextInDoc = 'target: chapter 1, verse 4.';
      //                                ---------     ^
      const initialSelection = 'chapter 1';
      expect(initialTextInDoc).withContext('setup').toContain(initialSelection);
      const textToIntroduce = 'FromAnotherWindow';
      const expectedFinalText = 'target: chapter 1, verFromAnotherWindowse 4.';
      //                                 ---------     -----------------
      const targetSegmentRef: string = 'verse_1_4';
      expect(env.component.getSegmentText(targetSegmentRef)).withContext('setup').toEqual(initialTextInDoc);
      expect(env.component.editor!.getText()).withContext('setup').toContain(initialTextInDoc);

      const rangeOfSegmentWithSelection: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (rangeOfSegmentWithSelection == null) {
        throw Error();
      }
      // Location of initialSelection in the editor's complete text.
      const selectionStart: number = rangeOfSegmentWithSelection.index + 'target: '.length;
      const selectionLength: number = initialSelection.length;
      env.component.editor?.setSelection(selectionStart, selectionLength);

      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', textToIntroduce);
      dataTransfer.setData('text/html', `<span background="white">${textToIntroduce}</span>`);
      const targetElement: Element | null = env.component.editor!.container.querySelector(
        `usx-segment[data-segment="${targetSegmentRef}"]`
      );
      const dragEvent: MockDragEvent = new MockDragEvent('drop', {
        dataTransfer,
        cancelable: true
      });
      dragEvent.setTarget(targetElement);

      // How far into the initialTextInDoc the user is trying to drop the new text
      const desiredIndexInSegment = 'target: chapter 1, ver'.length;
      // Override the point-to-index method behaviour, since the unit test isn't really dragging the mouse to an
      // element.
      const startContainer: Node = targetElement!.childNodes[0] as Node;
      // eslint-disable-next-line deprecation/deprecation
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: desiredIndexInSegment, startContainer } as Range);

      // SUT
      env.component.editor?.container.dispatchEvent(dragEvent);
      flush();

      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(expectedFinalText);
      expect(env.component.editor?.getText()).toContain(expectedFinalText);

      const desiredSelectionStart = rangeOfSegmentWithSelection.index + 'target: chapter 1, ver'.length;
      const desiredSelectionLength = textToIntroduce.length;
      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) {
        throw Error();
      }
      // After text is dragged into the document, the selection should be on the inserted text. The selection should
      // not necessarily be the text that was previously selected.
      expect(resultingSelection.index).toEqual(desiredSelectionStart);
      expect(resultingSelection.length).toEqual(desiredSelectionLength);
    }));

    it('dont drag-and-drop to an invalid target element', fakeAsync(() => {
      // If you drag text to near the top or bottom of a paragraph or segment, it looks like it's going to be dropped
      // where you are pointing, and in fact the browser point-to-index function appears to determine a location in the
      // segment we want to drop the text into, but the event.target is not the usx-segment: it can be something like
      // a usx-para-contents instead. A usx-para-contents might contain multiple usx-segment elements, and there is no
      // indication about which we are dropping into. We could make guesses about which segment is being dropped into
      // based on the point-to-index function, since its value would need to be less than or equal to the length of any
      // given segment. We could make guesses based on whether the text was dropped near the top of a paragraph or the
      // bottom of a paragraph. But the current approach does not have enough information to just identify the target
      // segment and insert the new content. So when this happens, just reject the drop. Don't insert, and don't remove
      // from the origin location.
      // As a helpful side effect, only dropping into a usx-segment also prevents inserting text where it doesn't
      // belong, like right before the verse of a paragraph, in a `usx-para` or right before the chapter number, in a
      // `div`.
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();

      const initialTextInDoc = 'target: chapter 1, verse 4.';
      //                                ---------     ^
      const textToMove = 'chapter 1';
      const originalAllText: string = env.component.editor!.getText();
      const targetSegmentRef: string = 'verse_1_4';
      expect(env.component.getSegmentText(targetSegmentRef)).withContext('setup').toEqual(initialTextInDoc);
      expect(env.component.editor!.getText()).withContext('setup').toContain(initialTextInDoc);

      const originSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (originSegmentRange == null) {
        throw Error();
      }
      const selectionStart: number = originSegmentRange.index + 'target: '.length;
      const selectionLength: number = textToMove.length;
      env.component.editor?.setSelection(selectionStart, selectionLength);
      const selection: RangeStatic | null = env.component.editor!.getSelection();

      // In this situation, the target element of the drag will be a usx-para-contents that contains
      // the usx-segment that the user was in fact hoping to drag to.
      const targetElement: Element | null = env.component.editor!.container.querySelector(
        `usx-segment[data-segment="${targetSegmentRef}"]`
      )!.parentElement;
      expect(targetElement!.localName).withContext('setup').toEqual('usx-para-contents');

      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', textToMove);
      dataTransfer.setData('text/html', `<span background="white">${textToMove}</span>`);
      const dragEvent: MockDragEvent = new MockDragEvent('drop', {
        dataTransfer,
        cancelable: true
      });
      // The target in this situation is the containing usx-para-contents element.
      dragEvent.setTarget(targetElement);

      // How far into the initialTextInDoc the user is trying to drop the new text
      const desiredIndexInSegment = 'target: chapter 1, ver'.length;
      // Override the point-to-index method behaviour, since the unit test isn't really dragging the mouse to an
      // element.
      const startContainer: Node = targetElement!.childNodes[0] as Node;
      // eslint-disable-next-line deprecation/deprecation
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: desiredIndexInSegment, startContainer } as Range);

      mockedConsole.expectAndHide(
        /never found a needed usx-segment ancestor for drop target/,
        'should make a note in the console while we identify more places for refinement'
      );

      // SUT
      const cancelled: boolean = !env.component.editor?.container.dispatchEvent(dragEvent);
      flush();

      // No change to text. No insert or delete.
      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(initialTextInDoc);
      expect(env.component.editor?.getText()).toContain(initialTextInDoc);
      expect(env.component.editor!.getText()).withContext('should be unchanged').toEqual(originalAllText);
      // event.preventDefault() should have been called as normal to prevent the browser from doing its own
      // drag-and-drop.
      expect(cancelled).toBeTrue();
      expect(env.component.editor!.getSelection())
        .withContext('selection should not have been changed')
        .toEqual(selection);
      mockedConsole.verify();
    }));

    it('allow drag-and-drop to blank verse, and quill changes are interleaved with TextComponent.updated events', fakeAsync(() => {
      // User drags to a blank verse. The target will be a usx-blank element rather than a usx-segment element. Insert
      // the text.
      // drag-and-drop makes use of `setTimeout()` to allow interleaving multiple programmatic edits with multiple
      // TextComponent.updated events. Without this, all the TextComponent.updated events would instead happen at once
      // at the end (and do the wrong things). This test specifies that the individual edit (eg insert, delete)
      // operations that drag-and-drop performs are interleaved with processing of subscribers to Textcomponent.updated.

      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();

      // segment 1 1 - user selects text in one segment
      const textLeadingUpToSelection_1_1 = 'target: ';
      const initialTextInDoc_1_1 = 'target: chapter 1, verse 1.';
      //                                    --------- move this
      const textToMoveFromSegment_1_1 = 'chapter 1';
      const expectedTextInDoc_1_1 = 'target: , verse 1.';
      // segment 1 2 - user drags to another segment, which is blank
      const textLeadingUpToTargetLocation_1_2 = '';
      const expectedTextInDoc_1_2 = 'chapter 1';
      expect(env.component.getSegmentText('verse_1_1')).withContext('setup').toEqual(initialTextInDoc_1_1);
      expect(env.component.editor!.getText()).withContext('setup').toContain(initialTextInDoc_1_1);
      const initialCountBlankElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'usx-blank'
      ).length;
      const expectedCountBlankElements = initialCountBlankElements - 1;
      const initialCountVerseElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'usx-verse'
      ).length;
      const initialCountSegmentElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'usx-segment'
      ).length;

      const originSegmentRange: RangeStatic | undefined = env.component.getSegmentRange('verse_1_1');
      if (originSegmentRange == null) {
        throw Error();
      }
      const selectionStart: number = originSegmentRange.index + textLeadingUpToSelection_1_1.length;
      const selectionLength: number = textToMoveFromSegment_1_1.length;
      env.component.editor?.setSelection(selectionStart, selectionLength);

      const blankElementTarget = env.component.editor!.container.querySelector(
        'usx-segment[data-segment="verse_1_2"] usx-blank'
      );

      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', textToMoveFromSegment_1_1);
      dataTransfer.setData('text/html', `<span background="white">${textToMoveFromSegment_1_1}</span>`);
      const dropEvent: MockDragEvent = new MockDragEvent('drop', {
        dataTransfer,
        cancelable: true
      });
      // The target in this situation is the usx-blank element.
      dropEvent.setTarget(blankElementTarget);

      // How far into the target segment the user is trying to drop the new text.
      // Note that or the situation of dropping into a blank segment, the value returned by the browser is not what we
      // want to use. Instead, we should use 1, to represent the position after the blank. Make the browser return a
      // value that will stand out if we use it.
      const valueThatShouldBeIgnored: number = 9876;
      // Override the point-to-index method behaviour, since the unit test isn't really dragging the mouse to an
      // element.
      // eslint-disable-next-line deprecation/deprecation
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: valueThatShouldBeIgnored, startContainer: blankElementTarget as Node } as Range);

      // Write custom note on event information that quill is the origin of the drag.
      const dragstartEvent: MockDragEvent = new MockDragEvent('dragstart', {
        dataTransfer,
        cancelable: true
      });
      env.component.editor?.container.dispatchEvent(dragstartEvent);
      tick();
      expect(dropEvent.dataTransfer?.types.includes(DragAndDrop.quillIsSourceToken)).toBeTrue();

      // Watch insert, delete, and set selection activity and record their call counts.
      const setSelectionSpy: jasmine.Spy<any> = spyOn<any>(env.component.editor!, 'setSelection').and.callThrough();
      const deleteTextSpy: jasmine.Spy<any> = spyOn<any>(env.component.editor!, 'deleteText').and.callThrough();
      const updateContentSpy: jasmine.Spy<any> = spyOn<any>(env.component.editor!, 'updateContents').and.callThrough();

      // Call counts of various quill methods, at times when TextComponent.updated emits are received by subscribers.
      const quillCallCountsAtUpdateFirings: {
        setSelectionCalls: number;
        deleteTextCalls: number;
        updateContentsCalls: number;
      }[] = [];
      const updatedSubscription: Subscription = env.component.updated.subscribe(() => {
        // Record call counts at the time of the 'updated' event.
        // Each time `TextComponent.updated` is processed, we will record the call counts of a few methods, for
        // later analysis.
        quillCallCountsAtUpdateFirings.push({
          setSelectionCalls: setSelectionSpy.calls.count(),
          deleteTextCalls: deleteTextSpy.calls.count(),
          updateContentsCalls: updateContentSpy.calls.count()
        });
      });

      // SUT
      const cancelled: boolean = !env.component.editor?.container.dispatchEvent(dropEvent);
      flush();

      updatedSubscription.unsubscribe();

      // It must be that TextComponent.updated is processed after each of delete, set selection, and insert
      // is called, so that EditorComponent and TextComponent can make changes in response to edits before
      // we move on to different segments.
      //
      // Note that when the SUT is run, at each occurrence of `TextComponent.updated` being processed, a snapshot is
      // taken of how many calls to setSelection, deleteText, and inertText is taken. If all the `TextComponent.
      // updated` events are processed last, at the end of the SUT, then all of the snapshots will report the same
      // number of calls for setSelection, deleteText, and inertText, because they would all have been called a certain
      // number of times before any `TextComponent.updated` events were processed. And this would show a problem
      // behaviour, where processing of `TextComponent.updated` events was not interleaved with the edit and selection
      // operations. If the `TextComponent.updated` events are in fact interleaved with the edit and selection
      // operations, then the array of snapshots should contain snapshots with _different_ data from one another, and
      // from it we can demonstrate that `TextComponent.updated` was processed after specific numbers of edit and
      // selection operations and before other ones. It doesn't matter if there are `TextComponent.updated` events
      // between one good snapshot and another good snapshot. And snapshots may show that other edit or selection
      // operations happened that we weren't anticipating at first, which can be okay. It is enough to assert that
      // there are specific snapshots in the set at all, as done below, to show a successful interleaving.

      // For the following expect, setSelection may have been called before we get to our deleteText, or
      // maybe as part of processing it. But significantly in the following expect() is that TextComponent.updated
      // fired after delete and before more setSelection or updateContents calls.
      expect(quillCallCountsAtUpdateFirings).toContain({
        setSelectionCalls: 1,
        deleteTextCalls: 1,
        updateContentsCalls: 0
      });
      // Then setSelection is called.
      expect(quillCallCountsAtUpdateFirings).toContain({
        setSelectionCalls: 2,
        deleteTextCalls: 1,
        updateContentsCalls: 0
      });
      // Then updateContents is called. Also setSelection must be getting called elsewhere as well. But importantly,
      // updateContentsCalls increased.
      expect(quillCallCountsAtUpdateFirings).toContain({
        setSelectionCalls: 4,
        deleteTextCalls: 1,
        updateContentsCalls: 2
      });
      // Then setSelection is called. It may not be as significant that the selecting of the inserted text is
      // interleaved with TextComponent.updated events, but it is in case.
      expect(quillCallCountsAtUpdateFirings).toContain({
        setSelectionCalls: 5,
        deleteTextCalls: 1,
        updateContentsCalls: 2
      });

      // origin segment lost the text
      expect(env.component.getSegmentText('verse_1_1')).toEqual(expectedTextInDoc_1_1);
      // destination segment gained the text
      expect(env.component.getSegmentText('verse_1_2')).toEqual(expectedTextInDoc_1_2);
      // (Not that this next expect is particularly meaningful. But for completeness...)
      expect(env.component.editor?.getText()).toContain(expectedTextInDoc_1_2);
      // event.preventDefault() should have been called to prevent the browser from also causing a drag-and-drop to
      // happen, carrying in formatting.
      expect(cancelled).toBeTrue();

      const targetSegmentRange: RangeStatic | undefined = env.component.getSegmentRange('verse_1_2');
      if (targetSegmentRange == null) {
        throw Error();
      }
      const desiredSelectionStart = targetSegmentRange.index + textLeadingUpToTargetLocation_1_2.length;
      const desiredSelectionLength = textToMoveFromSegment_1_1.length;
      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) {
        throw Error();
      }
      const endingCountBlankElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'usx-blank'
      ).length;
      expect(endingCountBlankElements)
        .withContext('a usx-blank element should have been removed')
        .toEqual(expectedCountBlankElements);
      const endingCountVerseElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'usx-verse'
      ).length;
      expect(endingCountVerseElements)
        .withContext('no change to count of usx-verse elements')
        .toEqual(initialCountVerseElements);
      const endingCountSegmentElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'usx-segment'
      ).length;
      expect(endingCountSegmentElements)
        .withContext('no change to count of usx-segment elements')
        .toEqual(initialCountSegmentElements);

      // After text is dragged, the new selection should be the inserted text.
      expect(resultingSelection.index).toEqual(desiredSelectionStart);
      expect(resultingSelection.length).toEqual(desiredSelectionLength);
    }));

    it('can drag-and-drop into note thread anchoring area', fakeAsync(() => {
      // The user drags into the region of the editor that is anchored to by a thread's text anchor. The dragged text
      // should appear where it's dropped.

      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();

      // segment 1 1 - user selects text
      const textLeadingUpToSelection_1_1 = 'target: ';
      const initialTextInDoc_1_1 = 'target: chapter 1, verse 1.';
      //                          move this-^^^^^^^^^   ^^^^-thread anchoring
      const textToMoveFromSegment_1_1 = 'chapter 1';
      // User drags to the middle of the thread anchoring and drops.
      const expectedTextInDoc_1_1 = 'target: , verchapter 1se 1.';
      const textLeadingUpToTargetLocationAfterEvent_1_1 = 'target: , ver';
      const textNodeTextBeforeEvent_1_1 = 'erse';
      const textLeadingUpToTargetTextNodeBeforeEvent_1_1 = 'target: chapter 1, v';
      // The drop location is in a text node in a display-text-anchor element. These are the characters in the text
      // node that lead up to the drop location.
      const textNodeTextLeadingUpToTargetLocationAfterEvent_1_1 = 'er';
      // The number of thread icons in the segment up to the location where the drop occurs (which is both before and
      // after the event in this test).
      const numberOfIconsLeadingUpToTargetLocation_1_1 = 1;
      const editorLengthOfThreadIcon = 1;
      env.embedThreadAt('MAT 1:1', {
        start: textLeadingUpToTargetTextNodeBeforeEvent_1_1.length,
        length: textNodeTextBeforeEvent_1_1.length
      });
      expect(env.component.getSegmentText('verse_1_1')).withContext('setup').toEqual(initialTextInDoc_1_1);
      expect(env.component.editor!.getText()).toContain(initialTextInDoc_1_1, 'setup');
      const initialCountDisplayTextAnchorElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'display-text-anchor'
      ).length;
      expect(initialCountDisplayTextAnchorElements).withContext('setup').toEqual(1);
      // The behaviour shouldn't result in any change to the number of <display-text-anchor> elements.
      const expectedCountDisplayTextAnchorElements = initialCountDisplayTextAnchorElements;
      const initialCountDisplayNoteElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'display-note'
      ).length;
      expect(initialCountDisplayNoteElements).withContext('setup').toEqual(1);
      // The behaviour shouldn't result in any change to the number of <display-note> elements.
      const expectedCountDisplayNoteElements = initialCountDisplayNoteElements;

      const originSegmentRange: RangeStatic | undefined = env.component.getSegmentRange('verse_1_1');
      if (originSegmentRange == null) {
        throw Error();
      }
      const selectionStart: number = originSegmentRange.index + textLeadingUpToSelection_1_1.length;
      const selectionLength: number = textToMoveFromSegment_1_1.length;
      env.component.editor?.setSelection(selectionStart, selectionLength);

      // Element on which the user drops.
      const elementDropTarget = env.component.editor!.container.querySelector(
        'usx-segment[data-segment="verse_1_1"] display-text-anchor'
      );
      // Specific node on which the user drops. This is the Range.startContainer reported by Chromium.
      const specificNodeDropTarget: ChildNode | undefined = elementDropTarget?.childNodes[1];
      if (specificNodeDropTarget == null) {
        fail('setup');
        return;
      }

      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', textToMoveFromSegment_1_1);
      dataTransfer.setData('text/html', `<span background="white">${textToMoveFromSegment_1_1}</span>`);
      const dropEvent: MockDragEvent = new MockDragEvent('drop', {
        dataTransfer,
        cancelable: true
      });
      dropEvent.setTarget(elementDropTarget);

      // How far into the target text node the user is trying to drop the text.
      const dropDistanceIn: number = textNodeTextLeadingUpToTargetLocationAfterEvent_1_1.length;
      expect(specificNodeDropTarget.nodeName).withContext('setup').toEqual('#text');
      expect(specificNodeDropTarget.nodeValue).withContext('setup').toEqual(textNodeTextBeforeEvent_1_1);
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

      expect(env.component.getSegmentText('verse_1_1'))
        .withContext('origin segment should be changed as expected')
        .toEqual(expectedTextInDoc_1_1);
      expect(cancelled).withContext('should cancel browser acting').toBeTrue();

      const targetSegmentRange: RangeStatic | undefined = env.component.getSegmentRange('verse_1_1');
      if (targetSegmentRange == null) {
        throw Error();
      }
      const desiredSelectionStart =
        targetSegmentRange.index +
        textLeadingUpToTargetLocationAfterEvent_1_1.length +
        numberOfIconsLeadingUpToTargetLocation_1_1 * editorLengthOfThreadIcon;
      const desiredSelectionLength = textToMoveFromSegment_1_1.length;
      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) {
        throw Error();
      }
      const endingCountDisplayTextAnchorElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'display-text-anchor'
      ).length;
      expect(endingCountDisplayTextAnchorElements)
        .withContext('number of display-text-anchor elements should be as expected')
        .toEqual(expectedCountDisplayTextAnchorElements);
      const endingCountDisplayNoteElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'display-note'
      ).length;
      expect(endingCountDisplayNoteElements)
        .withContext('number of display-note elements should be as expected')
        .toEqual(expectedCountDisplayNoteElements);

      // After text is dragged, the new selection should be the inserted text.
      expect(resultingSelection.index).toEqual(desiredSelectionStart);
      expect(resultingSelection.length).toEqual(desiredSelectionLength);
    }));

    it('can drag-and-drop correctly into overlapping note thread anchoring area', fakeAsync(() => {
      // The user drags into the region of the editor that is anchored to by the text anchorings of two threads. The
      // dragged text should appear where it's dropped. There should not be incorrect placement as a result of not
      // accounting for thread icons.

      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();

      // segment 1 1 - user selects text
      const textLeadingUpToSelection_1_1 = 'target: ';
      // Note that in this test, there is reference to a "thread1 text node" and a "thread2 text node". Those are
      // helpful designations but also inaccurate. There are text nodes, but not so much belonging to thread2, for
      // example.
      const initialTextInDoc_1_1 = 'target: chapter 1, verse 1.';
      //                          move this-^^^^^^^^^   ^^^^---thread1 anchoring
      //                                                ^------thread1 text node
      //                                                 ^^^^^-thread2 anchoring
      //                                                 ^^^^^-thread2 text node
      //                                                  ^----user drops here
      const textToMoveFromSegment_1_1 = 'chapter 1';
      // User drags to the middle of the thread1 anchoring and drops.
      const expectedTextInDoc_1_1 = 'target: , verchapter 1se 1.';
      const textLeadingUpToTargetLocationAfterEvent_1_1 = 'target: , ver';
      // There is no text node for the thread1's whole anchored content, but there will be a text node for the content
      // that is anchored to by thread1 and not by thread2.
      const thread1TextNodeTextBeforeEvent_1_1 = 'e';
      const thread1TextAnchoredTo = 'erse';
      const thread2TextNodeTextBeforeEvent_1_1 = 'rse 1';
      const thread2TextAnchoredTo = 'rse 1';
      const textLeadingUpToThread1TextNodeBeforeEvent_1_1 = 'target: chapter 1, v';
      const textLeadingUpToThread2TextNodeBeforeEvent_1_1 = 'target: chapter 1, ve';
      // The drop location is in a text node in a display-text-anchor element. This variable is of the characters in
      // the text node that lead up to the drop location. Note that the product will have one <display-text-anchor>
      // element containing multiple <display-note> elements (for icons) and #text nodes; there will not be multiple
      // <display-text-anchor> elements for the area of overlapping anchoring. The text node that the drop happens in
      // will be the thread2 text node.
      const textNodeTextLeadingUpToTargetLocationBeforeEvent_1_1 = 'r';
      // The number of thread icons in the segment up to the location where the drop occurs (which is both before and
      // after the event in this test).
      const numberOfIconsLeadingUpToTargetLocation_1_1 = 2;
      const editorLengthOfThreadIcon = 1;
      env.embedThreadAt('MAT 1:1', {
        start: textLeadingUpToThread1TextNodeBeforeEvent_1_1.length,
        length: thread1TextAnchoredTo.length
      });
      env.embedThreadAt('MAT 1:1', {
        start: textLeadingUpToThread2TextNodeBeforeEvent_1_1.length,
        length: thread2TextAnchoredTo.length
      });
      expect(env.component.getSegmentText('verse_1_1')).withContext('setup').toEqual(initialTextInDoc_1_1);
      expect(env.component.editor!.getText()).toContain(initialTextInDoc_1_1, 'setup');
      expect(env.component.editor!.getText()).toContain(
        textLeadingUpToThread1TextNodeBeforeEvent_1_1 +
          thread1TextNodeTextBeforeEvent_1_1 +
          thread2TextNodeTextBeforeEvent_1_1,
        'setup'
      );
      const initialCountDisplayTextAnchorElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'display-text-anchor'
      ).length;
      expect(initialCountDisplayTextAnchorElements).withContext('setup').toEqual(1);
      // The behaviour shouldn't result in any change to the number of <display-text-anchor> elements.
      const expectedCountDisplayTextAnchorElements = initialCountDisplayTextAnchorElements;
      const initialCountDisplayNoteElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'display-note'
      ).length;
      expect(initialCountDisplayNoteElements).withContext('setup').toEqual(2);
      // The behaviour shouldn't result in any change to the number of <display-note> elements.
      const expectedCountDisplayNoteElements = initialCountDisplayNoteElements;

      const originSegmentRange: RangeStatic | undefined = env.component.getSegmentRange('verse_1_1');
      if (originSegmentRange == null) {
        throw Error();
      }
      const selectionStart: number = originSegmentRange.index + textLeadingUpToSelection_1_1.length;
      const selectionLength: number = textToMoveFromSegment_1_1.length;
      env.component.editor?.setSelection(selectionStart, selectionLength);

      // Element on which the user drops.
      const elementDropTarget = env.component.editor!.container.querySelector(
        'usx-segment[data-segment="verse_1_1"] display-text-anchor'
      );
      // Specific node on which the user drops. This is the Range.startContainer reported by Chromium.
      const specificNodeDropTarget: ChildNode | undefined = elementDropTarget?.childNodes[3];
      if (specificNodeDropTarget == null) {
        fail('setup');
        return;
      }

      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', textToMoveFromSegment_1_1);
      dataTransfer.setData('text/html', `<span background="white">${textToMoveFromSegment_1_1}</span>`);
      const dropEvent: MockDragEvent = new MockDragEvent('drop', {
        dataTransfer,
        cancelable: true
      });
      dropEvent.setTarget(elementDropTarget);

      // How far into the target text node the user is trying to drop the text.
      const dropDistanceIn: number = textNodeTextLeadingUpToTargetLocationBeforeEvent_1_1.length;
      expect(specificNodeDropTarget.nodeName).withContext('setup').toEqual('#text');
      expect(specificNodeDropTarget.nodeValue).withContext('setup').toEqual(thread2TextNodeTextBeforeEvent_1_1);
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

      expect(env.component.getSegmentText('verse_1_1'))
        .withContext('origin segment should be changed as expected')
        .toEqual(expectedTextInDoc_1_1);
      expect(cancelled).withContext('should cancel browser acting').toBeTrue();

      const targetSegmentRange: RangeStatic | undefined = env.component.getSegmentRange('verse_1_1');
      if (targetSegmentRange == null) {
        throw Error();
      }
      const desiredSelectionStart =
        targetSegmentRange.index +
        textLeadingUpToTargetLocationAfterEvent_1_1.length +
        numberOfIconsLeadingUpToTargetLocation_1_1 * editorLengthOfThreadIcon;
      const desiredSelectionLength = textToMoveFromSegment_1_1.length;
      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) {
        throw Error();
      }
      const endingCountDisplayTextAnchorElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'display-text-anchor'
      ).length;
      expect(endingCountDisplayTextAnchorElements)
        .withContext('number of display-text-anchor elements should be as expected')
        .toEqual(expectedCountDisplayTextAnchorElements);
      const endingCountDisplayNoteElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'display-note'
      ).length;
      expect(endingCountDisplayNoteElements)
        .withContext('number of display-note elements should be as expected')
        .toEqual(expectedCountDisplayNoteElements);

      // After text is dragged, the new selection should be the inserted text.
      expect(resultingSelection.index).toEqual(desiredSelectionStart);
      expect(resultingSelection.length).toEqual(desiredSelectionLength);
    }));

    it('dropped text does not acquire underline formatting from a following anchor', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.embedNoteAtVerse(1);
      tick();

      let verse1Segment = env.component.editor!.container.querySelector('usx-segment[data-segment="verse_1_1"]')!;
      let textAnchorContent: string = verse1Segment.querySelector('display-text-anchor')!.textContent!;
      const expected = 'chapter';
      expect(textAnchorContent.trim()).toEqual(expected);

      const elementDropTarget: Element = env.component.editor!.container.querySelector(
        'usx-segment[data-segment="verse_1_1"]'
      )!;
      const specificNodeDropTarget: ChildNode = elementDropTarget.childNodes[0]!;
      const insertText = 'abc';
      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', insertText);
      dataTransfer.setData('text/html', `<span background="white">${insertText}</span>`);

      const dropEvent = new MockDragEvent('drop', { dataTransfer, cancelable: true });
      dropEvent.setTarget(elementDropTarget);
      const textBeforeDrop = 'target: ';
      const dropDistanceIn = textBeforeDrop.length;

      // eslint-disable-next-line deprecation/deprecation
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: dropDistanceIn, startContainer: specificNodeDropTarget as Node } as Range);
      env.component.editor!.container.dispatchEvent(dropEvent);
      flush();
      env.fixture.detectChanges();

      verse1Segment = env.component.editor!.container.querySelector('usx-segment[data-segment="verse_1_1"]')!;
      textAnchorContent = verse1Segment.querySelector('display-text-anchor')!.textContent!;
      expect(textAnchorContent.trim()).toEqual(expected);
    }));

    it('can drag-and-drop correctly near figure', fakeAsync(() => {
      // The user drags into a segment with a figure. We need to correctly calculate the drop position by correctly
      // understanding the editor length of the figure.

      // Various items other than body text can be in a document, such as endnotes, footnotes, cross references,
      // and figures. Each of these are editor-length 1, even if it is represented by a multi-character
      // string (like a footnote '12'). Drag-and-drop should work correctly in segments that contain
      // these, here referred to as "nuggets".
      // This test specifies behaviour around nuggets of the following element name.
      const nuggetElementName = 'usx-figure';

      const chapterNum = 2;
      // The following will be inserted into the text doc as part of the test.
      const nuggetTextDocSnippet: any = {
        figure: {
          style: 'fig',
          alt: 'figure description',
          src: 'picture.png',
          size: 'col',
          loc: 'location',
          copy: 'copyright c 1234',
          ref: `${chapterNum}.1`,
          contents: {
            ops: [
              {
                insert: 'caption here for a figure'
              }
            ]
          }
        }
      };
      // Length in the quill editor that is taken up by the nugget. For example, a usx-figure may be
      // length 1, while inserted text of 'hello' would be length 'hello'.length.
      const nuggetEditorLength = 1;
      testNugget({ nuggetElementName, chapterNum, nuggetTextDocSnippet, nuggetEditorLength });
    }));

    it('can drag-and-drop correctly near endnote', fakeAsync(() => {
      // The user drags into a segment with an endnote. We need to correctly calculate the drop position by correctly
      // understanding the editor length of the endnote representation in the editor's body text.

      const nuggetElementName = 'usx-note';
      const chapterNum = 2;
      const nuggetTextDocSnippet: any = {
        note: {
          caller: '+',
          style: 'fe',
          contents: {
            ops: [
              {
                insert: `${chapterNum}.1 `,
                attributes: {
                  char: {
                    style: 'fr',
                    closed: 'false',
                    cid: '65efb8c9-ebf1-4ac8-abd2-20b5e067996d'
                  }
                }
              },
              {
                insert: 'end note here ',
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
      };
      const nuggetEditorLength = 1;
      testNugget({ nuggetElementName, chapterNum, nuggetTextDocSnippet, nuggetEditorLength });
    }));

    it('can drag-and-drop correctly near foot note', fakeAsync(() => {
      // The user drags into a segment with a footnote. We need to correctly calculate the drop position by correctly
      // understanding the editor length of the foot note representation.

      const nuggetElementName = 'usx-note';
      const chapterNum = 2;
      const nuggetTextDocSnippet: any = {
        note: {
          caller: '+',
          style: 'f',
          contents: {
            ops: [
              {
                insert: `${chapterNum}.1 `,
                attributes: {
                  char: {
                    style: 'fr',
                    closed: 'false',
                    cid: '301a06f5-1db7-4cb8-baa5-9d59e6d18aff'
                  }
                }
              },
              {
                insert: 'footnote content ',
                attributes: {
                  char: {
                    style: 'ft',
                    closed: 'false',
                    cid: '4da3adf5-7c58-43c2-83e4-3e83e32568c3'
                  }
                }
              }
            ]
          }
        }
      };
      const nuggetEditorLength = 1;
      testNugget({ nuggetElementName, chapterNum, nuggetTextDocSnippet, nuggetEditorLength });
    }));

    it('can drag-and-drop correctly near cross reference', fakeAsync(() => {
      // The user drags into a segment with a cross reference. We need to correctly calculate the
      // drop position by correctly understanding the editor length of the cross reference in the DOM,
      // whether visible or not.

      const nuggetElementName = 'usx-note';
      const chapterNum = 2;
      const nuggetTextDocSnippet: any = {
        note: {
          caller: '-',
          style: 'x',
          contents: {
            ops: [
              {
                insert: `${chapterNum}.1 `,
                attributes: {
                  char: {
                    style: 'xo',
                    closed: 'false',
                    cid: '9e96af0f-508c-44c7-b112-1fc2ef4dc952'
                  }
                }
              },
              {
                insert: 'rut 1:1 ',
                attributes: {
                  char: {
                    style: 'xt',
                    closed: 'false',
                    cid: '49669fbe-a14d-4c55-9fe0-f4503740d392'
                  }
                }
              }
            ]
          }
        }
      };
      const nuggetEditorLength = 1;
      testNugget({ nuggetElementName, chapterNum, nuggetTextDocSnippet, nuggetEditorLength });
    }));

    it('can drag-and-drop correctly around usx-char elements', fakeAsync(() => {
      // The user drags text in a segment past a usx-char element.
      // We need to correctly calculate the drop position by correctly understanding the editor length of the
      /// usx-char element and its content.

      const nuggetElementName = 'usx-char';
      const chapterNum = 2;
      const nuggetTextDocSnippet: any = 'Some text to insert';
      const nuggetTextDocAttributes: any = {
        char: {
          style: 'w',
          closed: 'false',
          cid: '5e857a1b-82d5-4a4d-b904-903ce971cd90'
        },
        segment: `verse_${chapterNum}_1`
      };
      const nuggetTextDocText: string = nuggetTextDocSnippet;
      const nuggetEditorLength: number = nuggetTextDocSnippet.length;
      testNugget({
        nuggetElementName,
        chapterNum,
        nuggetTextDocSnippet,
        nuggetEditorLength,
        nuggetTextDocAttributes,
        nuggetTextDocText
      });
    }));

    it('can drag-and-drop correctly around usx-char elements with child elements', fakeAsync(() => {
      // The user drags text in a segment past a usx-char element that has one or more child nodes.
      // A usx-char may contain a text node of arbitrary length or other elements.

      const nuggetElementName = 'usx-char';
      const chapterNum = 2;
      // The following looks like it should just generate a <usx-note> element, not a <usx-char> element.
      // But setting "char" in the attributes results in creation of a <usx-char> that
      // contains this <usx-note>.
      // This textdoc data generates the following HTML in the DOM:
      // <usx-char data-style="w"><usx-note data-style="f" data-caller="+"
      // title="1.1 some footnote text ">X<span contenteditable="false"></span>X</usx-note></usx-char>
      // where the two `X`s are UTF-8 ef bb bf.
      const nuggetTextDocSnippet: any = {
        note: {
          caller: '+',
          style: 'f',
          contents: {
            ops: [
              {
                insert: '1.1 ',
                attributes: {
                  char: {
                    style: 'fr',
                    closed: 'false',
                    cid: '9ccc949b-44d4-4a63-bc98-eb50c45e9b92'
                  }
                }
              },
              {
                insert: 'some footnote text ',
                attributes: {
                  char: {
                    style: 'ft',
                    closed: 'false',
                    cid: '8b2480e4-70a9-414b-bad5-0458c5ab7296'
                  }
                }
              }
            ]
          }
        }
      };
      const nuggetTextDocAttributes: any = {
        char: {
          style: 'w',
          cid: 'dc7a49c1-ebfe-4f3d-af05-d86c61d776eb'
        },
        segment: `verse_${chapterNum}_1`
      };
      // 'body' text in the text doc that corresponds to the nugget.
      const nuggetTextDocText: string = '';
      const editorLengthOfFootnoteMark = 1;
      const nuggetEditorLength: number = editorLengthOfFootnoteMark;
      testNugget({
        nuggetElementName,
        chapterNum,
        nuggetTextDocSnippet,
        nuggetEditorLength,
        nuggetTextDocAttributes,
        nuggetTextDocText
      });
    }));

    interface testNuggetArgs {
      nuggetElementName: string;
      chapterNum: number;
      nuggetTextDocSnippet: any;
      nuggetEditorLength: number;
      nuggetTextDocAttributes?: any;
      // The text, as present in the text doc, that is part of 'body' text and is present by virtue of
      // the nugget existing. If any (it may be none for something like a figure).
      nuggetTextDocText?: string;
    }
    function testNugget(args: testNuggetArgs): void {
      const env = new TestEnvironment();
      const originSegmentRef = `verse_${args.chapterNum}_1`;
      const targetSegmentRef = `verse_${args.chapterNum}_1`;
      const textDocId: TextDocId = new TextDocId('project01', 40, args.chapterNum);
      if (args.nuggetTextDocAttributes == null) {
        args.nuggetTextDocAttributes = { segment: originSegmentRef };
      }
      if (args.nuggetTextDocText == null) {
        args.nuggetTextDocText = '';
      }

      const delta = new Delta();
      delta.insert({ chapter: { number: args.chapterNum.toString(), style: 'c' } });
      delta.insert({ blank: true }, { segment: 'p_1' });
      delta.insert({ verse: { number: '1', style: 'v' } });
      delta.insert(`The quick b`, { segment: `verse_${args.chapterNum}_1` });
      delta.insert(args.nuggetTextDocSnippet, args.nuggetTextDocAttributes);
      delta.insert(`rown fox jumps over the lazy dog.`, { segment: `verse_${args.chapterNum}_1` });
      env.realtimeService.addSnapshot<TextData>(TextDoc.COLLECTION, {
        id: textDocId.toString(),
        data: delta,
        type: RichText.type.name
      });

      env.fixture.detectChanges();
      env.id = textDocId;
      tick();

      const textLeadingUpToSelectionBeforeEvent = `The `;
      // This text is selected and is the text that will be moved by the drag-and-drop.
      const textToMove = `quick`;
      const textBetweenSelectionAndNugget = ` b`;
      // Then the nugget is present, possibly with text that would also be in the text doc.

      const textBetweenNuggetAndDropLocation = `rown fox `;
      // Then is the drop location.

      const textAfterDropLocation = `jumps over the lazy dog.`;
      // For example: `The quick brown fox jumps over the lazy dog.`
      const initialTextInDoc: string =
        textLeadingUpToSelectionBeforeEvent +
        textToMove +
        textBetweenSelectionAndNugget +
        args.nuggetTextDocText +
        textBetweenNuggetAndDropLocation +
        textAfterDropLocation;
      // For example: `The  brown fox quickjumps over the lazy dog.`;
      const expectedTextInDoc =
        textLeadingUpToSelectionBeforeEvent +
        textBetweenSelectionAndNugget +
        args.nuggetTextDocText +
        textBetweenNuggetAndDropLocation +
        textToMove +
        textAfterDropLocation;

      // After the drag-and-drop event, this is the editor length from the beginning of the segment
      // up to the drop location. Note that it's different than the _text_ length, as it can include
      // items that are only in the editor, like a footnote mark.
      // For example: Length of any editor-only things + 'The  brown fox '.length
      const editorLengthToTargetLocationAfterEvent: number =
        textLeadingUpToSelectionBeforeEvent.length +
        textBetweenSelectionAndNugget.length +
        args.nuggetEditorLength +
        textBetweenNuggetAndDropLocation.length;

      const textInTargetTextNodeLeadingUpToDropLocation = textBetweenNuggetAndDropLocation;
      // For example:  'rown fox jumps over the lazy dog.'
      const textInTargetTextNodeBeforeEvent = textBetweenNuggetAndDropLocation + textAfterDropLocation;

      expect(env.component.getSegmentText(originSegmentRef)).withContext('setup').toEqual(initialTextInDoc);
      expect(env.component.editor!.getText()).toContain(initialTextInDoc, 'setup');
      const initialNuggetElementCount = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        args.nuggetElementName
      ).length;
      expect(initialNuggetElementCount).withContext('setup').toEqual(1);
      const expectedElementCountNugget = initialNuggetElementCount;

      const originSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(originSegmentRef);
      if (originSegmentRange == null) {
        throw Error();
      }
      const selectionStart: number = originSegmentRange.index + textLeadingUpToSelectionBeforeEvent.length;
      const selectionLength: number = textToMove.length;
      env.component.editor?.setSelection(selectionStart, selectionLength);

      // Element on which the user drops.
      const elementDropTarget = env.component.editor!.container.querySelector(
        `usx-segment[data-segment="${targetSegmentRef}"]`
      );
      // Child node number on which the drop occurs, assuming the usx-segment has 3 child nodes:
      // text node, the nugget node, and a text node.
      const dropChildNodeIndex = 2;
      expect(elementDropTarget?.childNodes.length)
        .withContext('setup: not necessarily ready to handle this kind of test data')
        .toEqual(3);
      // Specific node on which the user drops. This is the Range.startContainer reported by Chromium.
      const specificNodeDropTarget: ChildNode | undefined = elementDropTarget?.childNodes[dropChildNodeIndex];
      if (specificNodeDropTarget == null) {
        fail('setup');
        return;
      }

      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', textToMove);
      dataTransfer.setData('text/html', `<span background="white">${textToMove}</span>`);
      const dropEvent: MockDragEvent = new MockDragEvent('drop', {
        dataTransfer,
        cancelable: true
      });
      dropEvent.setTarget(elementDropTarget);

      // How far into the target text node the user is trying to drop the text.
      const dropDistanceIn: number = textInTargetTextNodeLeadingUpToDropLocation.length;
      expect(specificNodeDropTarget.nodeName).withContext('setup').toEqual('#text');
      expect(specificNodeDropTarget.nodeValue).withContext('setup').toEqual(textInTargetTextNodeBeforeEvent);
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

      expect(env.component.getSegmentText(originSegmentRef))
        .withContext('origin segment should be changed as expected')
        .toEqual(expectedTextInDoc);
      expect(cancelled).withContext('should cancel browser acting').toBeTrue();

      const targetSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (targetSegmentRange == null) {
        throw Error();
      }
      const desiredSelectionStart = targetSegmentRange.index + editorLengthToTargetLocationAfterEvent;
      const desiredSelectionLength = textToMove.length;
      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) {
        throw Error();
      }
      const resultElementCountNugget = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        args.nuggetElementName
      ).length;
      expect(resultElementCountNugget)
        .withContext('number of these elements should be as expected')
        .toEqual(expectedElementCountNugget);

      // After text is dragged, the new selection should be the inserted text.
      expect(resultingSelection.index).toEqual(desiredSelectionStart);
      expect(resultingSelection.length).toEqual(desiredSelectionLength);
    }

    it('can drag-and-drop correctly to blank with sibling', fakeAsync(() => {
      // Some segments contain only a usx-blank. But usx-blank elements can also be accompanied by other pieces of
      // data in the text doc or in the DOM, such as a newline character or a display-text-anchor element (anchored
      // over an empty string).

      // The user drags to the usx-blank element. Text is dropped immediately after the usx-blank element (which
      // then disappears).

      // Beginning text doc.

      const chapterNum = 2;
      const targetSegmentVerse = 2;
      const originSegmentRef = `verse_${chapterNum}_1`;
      const targetSegmentRef = `verse_${chapterNum}_${targetSegmentVerse}`;
      const textDoc: RichText.DeltaOperation[] = [
        { insert: { chapter: { number: chapterNum.toString(), style: 'c' } } },
        { insert: { verse: { number: '1', style: 'v' } } },
        {
          attributes: {
            segment: originSegmentRef
          },
          insert: 'The quick brown fox'
        },
        { insert: { verse: { number: `${targetSegmentVerse}`, style: 'v' } } },
        {
          attributes: {
            segment: targetSegmentRef
          },
          insert: {
            blank: true
          }
        },
        { insert: { verse: { number: '3', style: 'v' } } },
        {
          attributes: {
            segment: `verse_${chapterNum}_3`
          },
          insert: 'jumps over the lazy dog.'
        }
      ];

      // The corresponding DOM for the segment with a blank and a note will be something like:
      // <usx-segment data-segment="verse_2_2" data-note-thread-count="1"
      // class="note-thread-segment"><display-text-anchor><display-note
      // style="--icon-file: url(/assets/icons/TagIcons/01flag1.png);" title="note text"
      // data-thread-id="f6653f5d">﻿<span contenteditable="false"
      // ></span>﻿</display-note></display-text-anchor><usx-blank>﻿<span contenteditable="false"
      // >&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>﻿</usx-blank></usx-segment>

      // TextComponent segment text, editor content, and expectations.

      const editorLengthOfBlank = 1;
      const editorLengthOfThreadIcon = 1;

      const textToMove = 'quick';
      const originSegmentContentBeforeEvent: SegmentContent = {
        text: 'The quick brown fox',
        editorLength: 'The quick brown fox'.length
      };
      expect(originSegmentContentBeforeEvent.text).withContext('setup').toContain(textToMove);
      const selectionBeforeEvent: SelectionSpecification = {
        segmentRef: originSegmentRef,
        text: textToMove,
        startEditorPosInSegment: 'The '.length,
        editorLength: textToMove.length
      };
      const targetSegmentContentBeforeEvent: SegmentContent = {
        text: '',
        editorLength: editorLengthOfThreadIcon + editorLengthOfBlank
      };
      const topLevelNodeSeriesBeforeEvent: string[] = ['display-text-anchor', 'usx-blank'];

      const expectedOriginSegmentContentAfterEvent: SegmentContent = {
        text: 'The  brown fox',
        editorLength: 'The  brown fox'.length
      };
      const expectedTargetSegmentContentAfterEvent: SegmentContent = {
        text: 'quick',
        editorLength: editorLengthOfThreadIcon + 'quick'.length
      };
      const expectedSelectionAfterEvent: SelectionSpecification = {
        segmentRef: targetSegmentRef,
        text: textToMove,
        startEditorPosInSegment: editorLengthOfThreadIcon,
        editorLength: textToMove.length
      };
      const expectedTopLevelNodeSeriesAfterEvent: string[] = ['display-text-anchor', '#text'];

      const env = new TestEnvironment({ chapterNum, textDoc });

      env.embedThreadAt(`MAT ${chapterNum}:${targetSegmentVerse}`, {
        start: 0,
        length: 0
      });

      // Drop target information.

      expect(env.component.editor!.container.querySelectorAll(`usx-segment[data-segment="${targetSegmentRef}"]`).length)
        .withContext('setup: should be testing situation with one usx-segment element for the segment ref')
        .toEqual(1);
      // usx-segment element where the drop occurs.
      const segmentElementDropTarget: Element | null = env.component.editor!.container.querySelector(
        `usx-segment[data-segment="${targetSegmentRef}"]`
      );
      // Element on which the user drops (which might be the same as the usx-segment element).
      const elementDropTarget: Element | null = env.component.editor!.container.querySelector(
        `usx-segment[data-segment="${targetSegmentRef}"] usx-blank`
      );
      // Specific node on which the user drops, such as sometimes a #text node. This is the
      // Range.startContainer reported by Chromium.
      // When dropping on a usx-blank, the startContainer is the usx-blank, not the usx-blank's span's [0] #text node.
      const specificNodeDropTarget: ChildNode | null | undefined = env.component.editor?.container.querySelector(
        `usx-segment[data-segment="${targetSegmentRef}"] usx-blank`
      );

      // How far into the specific drop node the user is trying to drop the text.
      // The drop position into a usx-blank can be one of various small numbers, presumably depending on
      // where in the set of nbsp characters the drop occurs. Let's say 3 here.
      const dropDistanceIn: number = 3;

      if (segmentElementDropTarget == null) {
        fail('setup');
        return;
      }
      if (elementDropTarget == null) {
        fail('setup');
        return;
      }
      if (specificNodeDropTarget == null) {
        fail('setup');
        return;
      }

      const args: PerformDropTestArgs = {
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
      };
      env.performDropTest(args);
    }));

    function skipProblemTest(extraSteps: (env: TestEnvironment, dropEvent: MockDragEvent) => void) {
      // Certain unexpected situations should result in not doing anything without creating a problem.

      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      const startingTextInQuillSegment_1_4 = 'target: chapter 1, verse 4.';
      const textRequestedToInsert = 'Hello';
      const targetSegmentRef: string = 'verse_1_4';
      expect(env.component.getSegmentText(targetSegmentRef))
        .withContext('setup')
        .toEqual(startingTextInQuillSegment_1_4);
      const originalAllText: string = env.component.editor!.getText();

      const dataTransfer = new DataTransfer();
      dataTransfer.setData('text/plain', textRequestedToInsert);
      dataTransfer.setData('text/html', `<span background="white">${textRequestedToInsert}</span>`);
      const dropEvent: MockDragEvent = new MockDragEvent('drop', {
        dataTransfer,
        cancelable: true
      });
      const targetElement: Element | null = env.component.editor!.container.querySelector(
        `usx-segment[data-segment="${targetSegmentRef}"]`
      );
      dropEvent.setTarget(targetElement);

      // How far into the target segment the user is trying to drop the new text.
      const desiredIndexInSegment = 'target: chapter'.length;
      // Override the point-to-index method behaviour, since the unit test isn't really dragging the mouse
      // to an element.
      // eslint-disable-next-line deprecation/deprecation
      document.caretRangeFromPoint = (_x: number, _y: number) => ({ startOffset: desiredIndexInSegment } as Range);

      // Quill is not the origin of the drag for this test.
      expect(dropEvent.dataTransfer?.types.includes(DragAndDrop.quillIsSourceToken)).toBeFalse();

      // Some text is selected in the editor at the time.
      const targetSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (targetSegmentRange == null) {
        throw Error();
      }
      const selectionStart = targetSegmentRange.index + 'target: cha'.length;
      const selectionLength = 'pter 1, ve'.length;
      env.component.editor!.setSelection(selectionStart, selectionLength);
      const selection: RangeStatic | null = env.component.editor!.getSelection();

      extraSteps(env, dropEvent);

      // SUT
      const cancelled: boolean = !env.component.editor?.container.dispatchEvent(dropEvent);
      flush();

      // No change to text. No insert or delete.
      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(startingTextInQuillSegment_1_4);
      expect(env.component.editor!.getText()).withContext('should be unchanged').toEqual(originalAllText);
      // event.preventDefault() should have been called as normal to prevent the browser from doing its own
      // drag-and-drop.
      expect(cancelled).toBeTrue();
      expect(env.component.editor!.getSelection())
        .withContext('selection should not have been changed')
        .toEqual(selection);
    }

    it('skips problem: the drag event has a null target element.', fakeAsync(() => {
      mockedConsole.expectAndHideOnly(/unexpectedly has null target/);
      skipProblemTest((_env: TestEnvironment, dropEvent: MockDragEvent) => {
        const targetElement: Element | null = null;
        dropEvent.setTarget(targetElement);
      });
      mockedConsole.verify();
    }));

    it('skips problem: the drag event has a usx-blank target with a null parent element.', fakeAsync(() => {
      mockedConsole.expectAndHideOnly(/never found a needed usx-segment ancestor for drop target/);
      skipProblemTest((env: TestEnvironment, dropEvent: MockDragEvent) => {
        const targetElement: Element = document.createElement('usx-blank');
        expect(targetElement.parentElement).withContext('setup').toBeNull();
        dropEvent.setTarget(targetElement);
      });
      mockedConsole.verify();
    }));

    it('skips problem: The drag event unexpectedly has null dataTransfer information.', fakeAsync(() => {
      mockedConsole.expectAndHideOnly(/unexpectedly has null dataTransfer/);
      skipProblemTest((_env: TestEnvironment, dropEvent: MockDragEvent) => {
        dropEvent.setDataTransfer(null);
      });
      mockedConsole.verify();
    }));

    it('skips problem: target element defines no segment ref attribute ', fakeAsync(() => {
      mockedConsole.expectAndHideOnly(/no segment ref attribute/);
      skipProblemTest((_env: TestEnvironment, dropEvent: MockDragEvent) => {
        // Don't grab the actual target in the DOM and remove the attribute because later the quill editor selection
        // gets changed. Instead, just make a new element with no `data-segment` attribute and overwrite the target
        // with it.
        const outOfDomTargetElement: Element = document.createElement('usx-segment');
        dropEvent.setTarget(outOfDomTargetElement);
      });
      mockedConsole.verify();
    }));

    it('skips problem: TextComponent has no segment range recorded for null destination segment ref.', fakeAsync(() => {
      mockedConsole.expectAndHideOnly(/Invalid segment specification/);
      skipProblemTest((env: TestEnvironment, dropEvent: MockDragEvent) => {
        // An Element was written into the event target, so just cast target back to an Element.
        const targetElement: Element = dropEvent.target as Element;
        targetElement!.attributes['data-segment'].value = null;
      });
      mockedConsole.verify();
    }));

    it('skips problem: TextComponent has no segment range recorded for unfamiliar destination segment.', fakeAsync(() => {
      mockedConsole.expectAndHideOnly(/Invalid segment specification/);
      skipProblemTest((env: TestEnvironment, dropEvent: MockDragEvent) => {
        const targetSegmentRef = 'not_findable';
        expect(env.component!.getSegmentRange(targetSegmentRef)).withContext('setup').not.toBeDefined();
        // An Element was written into the event target, so just cast target back to an Element.
        const targetElement: Element = dropEvent.target as Element;
        targetElement!.attributes['data-segment'].value = targetSegmentRef;
      });
      mockedConsole.verify();
    }));

    it('skips problem: Firefox unexpectedly gives a null insertion position.', fakeAsync(() => {
      mockedConsole.expectAndHideOnly(/null caret position for insertion/);
      skipProblemTest((_env: TestEnvironment, _dropEvent: MockDragEvent) => {
        document.caretPositionFromPoint = (_x: number, _y: number) => null;
        // Remove the Chromium point-to-index method so the Firefox one will be used (in our Chromium test runner).
        (document as any).caretRangeFromPoint = undefined;
      });
      mockedConsole.verify();
    }));

    it('skips problem: No success determining insertion position.', fakeAsync(() => {
      mockedConsole.expectAndHideOnly(/Could not determine insertion position/);
      skipProblemTest((_env: TestEnvironment, _dropEvent: MockDragEvent) => {
        // Both Chromium and Firefox point-to-index methods are unavailable for this test.
        (document as any).caretRangeFromPoint = undefined;
        (document as any).caretPositionFromPoint = undefined;
      });
      mockedConsole.verify();
    }));

    it('skips problem: start container node is null', fakeAsync(() => {
      mockedConsole.expectAndHideOnly(/Could not get the node that the text was dropped into/);
      skipProblemTest((_env: TestEnvironment, _dropEvent: MockDragEvent) => {
        // the start container of the range for the browser's point-to-index method is unavailable.
        // eslint-disable-next-line deprecation/deprecation
        document.caretRangeFromPoint = (_x: number, _y: number) => ({ startOffset: 0 } as Range);
      });
      mockedConsole.verify();
    }));

    // End drag-and-drop section of tests.
  });
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
  chapterNum?: number;
  textDoc?: RichText.DeltaOperation[];
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

  public setTarget(newTarget: EventTarget | null) {
    this._target = newTarget;
  }

  public setDataTransfer(newDataTransfer: DataTransfer | null) {
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
    (presenceChange)="onPresenceChange($event)"
  ></app-text>`
})
class HostComponent {
  @ViewChild(TextComponent) textComponent!: TextComponent;

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

  constructor({ textDoc, chapterNum }: TestEnvCtorArgs = {}) {
    when(mockedPwaService.onlineStatus).thenReturn(this._onlineStatus.asObservable());
    when(mockedPwaService.isOnline).thenReturn(this.isOnline);
    when(mockedTranslocoService.translate<string>(anything())).thenCall(
      (translationStringKey: string) => translationStringKey
    );

    const matTextDocId = new TextDocId('project01', 40, 1);
    const mrkTextDocId = new TextDocId('project01', 41, 1);
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project01',
      data: getSFProject('project01')
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
      }
    ]);

    when(mockedProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );
    when(mockedProjectService.getProfile(anything())).thenCall(() =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, 'project01')
    );
    when(mockedUserService.getCurrentUser()).thenResolve({ data: { displayName: 'name' } } as UserDoc);

    this.fixture = TestBed.createComponent(HostComponent);
    this.fixture.detectChanges();
    this.component = this.fixture.componentInstance.textComponent;
    this.hostComponent = this.fixture.componentInstance;

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

  isSegmentHighlighted(chapter: number, verse: number | string): boolean {
    const segment = this.quillEditor.querySelector(`usx-segment[data-segment="verse_${chapter}_${verse}"]`)!;
    return segment != null && segment.classList.contains('highlight-segment');
  }

  embedNoteAtVerse(verse: number): void {
    const textAnchor: TextAnchor = { start: 8, length: 7 };
    this.embedThreadAt(`MAT 1:${verse}`, textAnchor);
  }

  /** Where reference is like 'MAT 1:2'. */
  embedThreadAt(reference: string, textAnchor: TextAnchor): void {
    const verseRef: VerseRef = VerseRef.parse(reference);
    const uniqueSuffix: string = Math.random().toString();
    const id: string = `embedid${reference}${uniqueSuffix}`;
    const iconSource: string = '--icon-file: url(/assets/icons/TagIcons/01flag1.png)';
    const text: string = `text message on ${id}`;
    const format = { iconsrc: iconSource, preview: text, threadid: id };
    this.component.embedElementInline(verseRef, id, textAnchor, 'note-thread-embed', format);
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

  /** Assert that in `parentNode`, there are only immediate children with name and order specified in
   * `nodeOrderings`. */
  private assertNodeOrder(parentNode: Node, nodeOrderings: string[]): void {
    const childNodes: string[] = Array.from(parentNode.childNodes).map((n: ChildNode) => n.nodeName.toLowerCase());
    expect(childNodes)
      .withContext(`not expected list of nodes: [${childNodes}] does not match expected [${nodeOrderings}]`)
      .toEqual(nodeOrderings);
  }
}
