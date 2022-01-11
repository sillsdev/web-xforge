import { CommonModule } from '@angular/common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { TranslocoService } from '@ngneat/transloco';
import Quill, { RangeStatic } from 'quill';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TextAnchor } from 'realtime-server/lib/esm/scriptureforge/models/text-anchor';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import * as RichText from 'rich-text';
import { BehaviorSubject, Subscription } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { AvatarTestingModule } from 'xforge-common/avatar/avatar-testing.module';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { Delta, TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { SharedModule } from '../shared.module';
import { getCombinedVerseTextDoc, getSFProject, getTextDoc } from '../test-utils';
import { DragAndDrop } from './drag-and-drop';
import { TextComponent } from './text.component';

const mockedBugsnagService = mock(BugsnagService);
const mockedTranslocoService = mock(TranslocoService);
const mockedPwaService = mock(PwaService);
const mockedProjectService = mock(SFProjectService);

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
      { provide: TranslocoService, useMock: mockedTranslocoService },
      { provide: PwaService, useMock: mockedPwaService }
    ]
  }));

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
    expect(env.component.editor?.getText()).toContain('chapter 1, verse 6.', 'setup');
    expect(env.component.editor?.getContents().ops?.length).toEqual(25, 'setup');

    env.component.editor?.updateContents(new Delta().retain(109).retain(31, { para: null }));

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
      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(initialTextInDoc, 'setup');
      expect(env.component.editor!.getText()).toContain(initialTextInDoc, 'setup');

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
      // Override the Chromium point-to-index method behaviour, since the unit test isn't really dragging the mouse
      // to an element.
      const startContainer: Node = targetElement!.childNodes[0] as Node;
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

      const sourceSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (sourceSegmentRange == null) {
        throw Error();
      }
      const desiredSelectionStart = sourceSegmentRange.index + 'target: chapter'.length;
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
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: textNodeIndex, startContainer } as Range);

      // SUT
      env.component.editor?.container.dispatchEvent(dragEvent);
      flush();

      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(expectedFinalText);
      expect(env.component.editor?.getText()).toContain(expectedFinalText);

      const sourceSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (sourceSegmentRange == null) {
        throw Error();
      }
      const desiredSelectionStart = sourceSegmentRange.index + 'target: $chapter 1, '.length;
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

      const sourceSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (sourceSegmentRange == null) {
        throw Error();
      }
      const desiredSelectionStart = sourceSegmentRange.index + 'target: chapter'.length;
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

      const sourceSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (sourceSegmentRange == null) {
        throw Error();
      }
      const desiredSelectionStart = sourceSegmentRange.index + 'target: $chapter 1, '.length;
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
      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(initialTextInDoc, 'setup');
      expect(env.component.editor!.getText()).toContain(initialTextInDoc, 'setup');

      const sourceSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (sourceSegmentRange == null) {
        throw Error();
      }
      // Location of textToMove in the editor's complete text.
      const selectionStart: number = sourceSegmentRange.index + 'target: '.length;
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
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: desiredIndexInSegment, startContainer } as Range);

      const dragstartEvent: MockDragEvent = new MockDragEvent('dragstart', {
        dataTransfer,
        cancelable: true
      });

      // Setup. The drag-and-drop activity should not start out with the custom note on the event objects.
      expect(dragstartEvent.dataTransfer?.types.includes(DragAndDrop.quillIsSourceToken)).toBeFalse();
      expect(DragAndDrop.quillIsSourceToken.length).toBeGreaterThan(0, 'setup');

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

      const desiredSelectionStart = sourceSegmentRange.index + 'target: , ver'.length;
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

      const sourceSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (sourceSegmentRange == null) {
        throw Error();
      }
      // Location of textToMove in the editor's complete text.
      const selectionStart: number = sourceSegmentRange.index + 'target: '.length;
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

      const desiredSelectionStart = sourceSegmentRange.index + 'tar'.length;
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
      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(initialTextInDoc, 'setup');
      expect(env.component.editor!.getText()).toContain(initialTextInDoc, 'setup');

      const sourceSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (sourceSegmentRange == null) {
        throw Error();
      }
      // Location of textToMove in the editor's complete text.
      const selectionStart: number = sourceSegmentRange.index + 'target: '.length;
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
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: desiredIndexInSegment, startContainer } as Range);

      const dragstartEvent: MockDragEvent = new MockDragEvent('dragstart', {
        dataTransfer,
        cancelable: true
      });

      // Setup. The drag-and-drop activity should not start out with the custom note on the event objects.
      expect(dragstartEvent.dataTransfer?.types.includes(DragAndDrop.quillIsSourceToken)).toBeFalse();
      expect(DragAndDrop.quillIsSourceToken.length).toBeGreaterThan(0, 'setup');

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
      const desiredSelectionStart = sourceSegmentRange.index + textLeadingUpToInsertionPosition.length;
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
      expect(initialTextInDoc).toContain(initialSelection, 'setup');
      const textToIntroduce = 'FromAnotherWindow';
      const expectedFinalText = 'target: chapter 1, verFromAnotherWindowse 4.';
      //                                 ---------     -----------------
      const targetSegmentRef: string = 'verse_1_4';
      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(initialTextInDoc, 'setup');
      expect(env.component.editor!.getText()).toContain(initialTextInDoc, 'setup');

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
      // from the source location.
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
      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(initialTextInDoc, 'setup');
      expect(env.component.editor!.getText()).toContain(initialTextInDoc, 'setup');

      const sourceSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (sourceSegmentRange == null) {
        throw Error();
      }
      const selectionStart: number = sourceSegmentRange.index + 'target: '.length;
      const selectionLength: number = textToMove.length;
      env.component.editor?.setSelection(selectionStart, selectionLength);
      const selection: RangeStatic | null = env.component.editor!.getSelection();

      // In this situation, the target element of the drag will be a usx-para-contents that contains
      // the usx-segment that the user was in fact hoping to drag to.
      const targetElement: Element | null = env.component.editor!.container.querySelector(
        `usx-segment[data-segment="${targetSegmentRef}"]`
      )!.parentElement;
      expect(targetElement!.localName).toEqual('usx-para-contents', 'setup');

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
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: desiredIndexInSegment, startContainer } as Range);

      // SUT
      const cancelled: boolean = !env.component.editor?.container.dispatchEvent(dragEvent);
      flush();

      // No change to text. No insert or delete.
      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(initialTextInDoc);
      expect(env.component.editor?.getText()).toContain(initialTextInDoc);
      expect(env.component.editor!.getText()).toEqual(originalAllText, 'should be unchanged');
      // event.preventDefault() should have been called as normal to prevent the browser from doing its own
      // drag-and-drop.
      expect(cancelled).toBeTrue();
      expect(env.component.editor!.getSelection()).toEqual(selection, 'selection should not have been changed');
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
      expect(env.component.getSegmentText('verse_1_1')).toEqual(initialTextInDoc_1_1, 'setup');
      expect(env.component.editor!.getText()).toContain(initialTextInDoc_1_1, 'setup');
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

      const sourceSegmentRange: RangeStatic | undefined = env.component.getSegmentRange('verse_1_1');
      if (sourceSegmentRange == null) {
        throw Error();
      }
      const selectionStart: number = sourceSegmentRange.index + textLeadingUpToSelection_1_1.length;
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
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: valueThatShouldBeIgnored, startContainer: blankElementTarget as Node } as Range);

      // Write custom note on event information that quill is the source of the drag.
      const dragstartEvent: MockDragEvent = new MockDragEvent('dragstart', {
        dataTransfer,
        cancelable: true
      });
      env.component.editor?.container.dispatchEvent(dragstartEvent);
      tick();
      expect(dropEvent.dataTransfer?.types.includes(DragAndDrop.quillIsSourceToken)).toBeTrue();

      // Watch insert, delete, and set selction activity and record their call counts.
      const setSelectionSpy: jasmine.Spy<any> = spyOn<any>(env.component.editor!, 'setSelection').and.callThrough();
      const deleteTextSpy: jasmine.Spy<any> = spyOn<any>(env.component.editor!, 'deleteText').and.callThrough();
      const insertTextSpy: jasmine.Spy<any> = spyOn<any>(env.component.editor!, 'insertText').and.callThrough();

      // Call counts of various quill methods, at times when TextComponent.updated emits are received by subscribers.
      const quillCallCountsAtUpdateFirings: {
        setSelectionCalls: number;
        deleteTextCalls: number;
        insertTextCalls: number;
      }[] = [];
      const updatedSubscription: Subscription = env.component.updated.subscribe(() => {
        // Record call counts at the time of the 'updated' event.
        // Each time `TextComponent.updated` is processed, we will record the call counts of a few methods, for
        // later analysis.
        quillCallCountsAtUpdateFirings.push({
          setSelectionCalls: setSelectionSpy.calls.count(),
          deleteTextCalls: deleteTextSpy.calls.count(),
          insertTextCalls: insertTextSpy.calls.count()
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
      // fired after delete and before more setSelection or insertText calls.
      expect(quillCallCountsAtUpdateFirings).toContain({
        setSelectionCalls: 1,
        deleteTextCalls: 1,
        insertTextCalls: 0
      });
      // Then setSelection is called.
      expect(quillCallCountsAtUpdateFirings).toContain({
        setSelectionCalls: 2,
        deleteTextCalls: 1,
        insertTextCalls: 0
      });
      // Then insertText is called. Also setSelection must be getting called elsewhere as well. But importantly,
      // insertTextCalls increased.
      expect(quillCallCountsAtUpdateFirings).toContain({
        setSelectionCalls: 5,
        deleteTextCalls: 1,
        insertTextCalls: 1
      });
      // Then setSelection is called. It may not be as significant that the selecting of the inserted text is
      // interleaved with TextComponent.updated events, but it is in case.
      expect(quillCallCountsAtUpdateFirings).toContain({
        setSelectionCalls: 6,
        deleteTextCalls: 1,
        insertTextCalls: 1
      });

      // source segment lost the text
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
      expect(endingCountBlankElements).toEqual(
        expectedCountBlankElements,
        'a usx-blank element should have been removed'
      );
      const endingCountVerseElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'usx-verse'
      ).length;
      expect(endingCountVerseElements).toEqual(initialCountVerseElements, 'no change to count of usx-verse elements');
      const endingCountSegmentElements = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'usx-segment'
      ).length;
      expect(endingCountSegmentElements).toEqual(
        initialCountSegmentElements,
        'no change to count of usx-segment elements'
      );

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

      const sourceSegmentRange: RangeStatic | undefined = env.component.getSegmentRange('verse_1_1');
      if (sourceSegmentRange == null) {
        throw Error();
      }
      const selectionStart: number = sourceSegmentRange.index + textLeadingUpToSelection_1_1.length;
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
        .withContext('source segment should be changed as expected')
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

      const sourceSegmentRange: RangeStatic | undefined = env.component.getSegmentRange('verse_1_1');
      if (sourceSegmentRange == null) {
        throw Error();
      }
      const selectionStart: number = sourceSegmentRange.index + textLeadingUpToSelection_1_1.length;
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
        .withContext('source segment should be changed as expected')
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

    it('can drag-and-drop correctly near figure', fakeAsync(() => {
      // The user drags into a segment with a figure. We need to correctly calculate the drop position by correctly
      // understanding the editor length of the figure.

      const env = new TestEnvironment();

      const chapterNum = 2;
      const sourceSegmentRef = `verse_${chapterNum}_1`;
      const targetSegmentRef = `verse_${chapterNum}_1`;

      const textDocId: TextDocId = new TextDocId('project01', 40, chapterNum);

      const delta = new Delta();
      delta.insert({ chapter: { number: chapterNum.toString(), style: 'c' } });
      delta.insert({ blank: true }, { segment: 'p_1' });
      delta.insert({ verse: { number: '1', style: 'v' } });
      delta.insert(`The quick b`, { segment: `verse_${chapterNum}_1` });
      delta.insert(
        {
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
        },
        { segment: sourceSegmentRef }
      );
      delta.insert(`rown fox jumps over the lazy dog.`, { segment: `verse_${chapterNum}_1` });

      env.realtimeService.addSnapshot<TextData>(TextDoc.COLLECTION, {
        id: textDocId.toString(),
        data: delta,
        type: RichText.type.name
      });

      env.fixture.detectChanges();
      env.id = textDocId;
      tick();

      const initialTextInDoc = `The quick brown fox jumps over the lazy dog.`;
      // figure before this char ----------^
      // user selection ------------^^^^^
      // drop location -----------------------------^
      // content of text node after fig ---^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
      const expectedTextInDoc = `The  brown fox quickjumps over the lazy dog.`;
      // figure should still be here --^

      const textLeadingUpToSelectionBeforeEvent = 'The ';
      const textToMove = 'quick';
      const textLeadingUpToTargetLocationAfterEvent = 'The  brown fox ';
      const textInTargetTextNodeLeadingUpToDropLocation = 'rown fox ';
      const textInTargetTextNodeBeforeEvent = 'rown fox jumps over the lazy dog.';

      // The number of elements in the segment up to the location where the drop occurs, which are elements that are
      // considered to be of length 1 in the editor.
      const numberOfSinglesLeadingUpToTargetLocation = 1;
      const editorLengthOfSingles = 1;

      expect(env.component.getSegmentText(sourceSegmentRef)).withContext('setup').toEqual(initialTextInDoc);
      expect(env.component.editor!.getText()).toContain(initialTextInDoc, 'setup');
      const initialElementCountUsxFig = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'usx-figure'
      ).length;
      expect(initialElementCountUsxFig).withContext('setup').toEqual(1);
      const expectedElementCountUsxFig = initialElementCountUsxFig;

      const sourceSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(sourceSegmentRef);
      if (sourceSegmentRange == null) {
        throw Error();
      }
      const selectionStart: number = sourceSegmentRange.index + textLeadingUpToSelectionBeforeEvent.length;
      const selectionLength: number = textToMove.length;
      env.component.editor?.setSelection(selectionStart, selectionLength);

      // Element on which the user drops.
      const elementDropTarget = env.component.editor!.container.querySelector(
        `usx-segment[data-segment="${targetSegmentRef}"]`
      );
      // Specific node on which the user drops. This is the Range.startContainer reported by Chromium.
      const specificNodeDropTarget: ChildNode | undefined = elementDropTarget?.childNodes[2];
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

      expect(env.component.getSegmentText(sourceSegmentRef))
        .withContext('source segment should be changed as expected')
        .toEqual(expectedTextInDoc);
      expect(cancelled).withContext('should cancel browser acting').toBeTrue();

      const targetSegmentRange: RangeStatic | undefined = env.component.getSegmentRange(targetSegmentRef);
      if (targetSegmentRange == null) {
        throw Error();
      }
      const desiredSelectionStart =
        targetSegmentRange.index +
        textLeadingUpToTargetLocationAfterEvent.length +
        numberOfSinglesLeadingUpToTargetLocation * editorLengthOfSingles;
      const desiredSelectionLength = textToMove.length;
      const resultingSelection: RangeStatic | null = env.component.editor!.getSelection();
      if (resultingSelection == null) {
        throw Error();
      }
      const resultElementCountUsxFig = (env.component.editor?.root as HTMLDivElement).getElementsByTagName(
        'usx-figure'
      ).length;
      expect(resultElementCountUsxFig)
        .withContext('number of these elements should be as expected')
        .toEqual(expectedElementCountUsxFig);

      // After text is dragged, the new selection should be the inserted text.
      expect(resultingSelection.index).toEqual(desiredSelectionStart);
      expect(resultingSelection.length).toEqual(desiredSelectionLength);
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
      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(startingTextInQuillSegment_1_4, 'setup');
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
      document.caretRangeFromPoint = (_x: number, _y: number) => ({ startOffset: desiredIndexInSegment } as Range);

      // Quill is not the source of the drag for this test.
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
      expect(env.component.editor!.getText()).toEqual(originalAllText, 'should be unchanged');
      // event.preventDefault() should have been called as normal to prevent the browser from doing its own
      // drag-and-drop.
      expect(cancelled).toBeTrue();
      expect(env.component.editor!.getSelection()).toEqual(selection, 'selection should not have been changed');
    }

    it('skips problem: the drag event has a null target element.', fakeAsync(() => {
      skipProblemTest((_env: TestEnvironment, dropEvent: MockDragEvent) => {
        const targetElement: Element | null = null;
        dropEvent.setTarget(targetElement);
      });
    }));

    it('skips problem: the drag event has a usx-blank target with a null parent element.', fakeAsync(() => {
      skipProblemTest((env: TestEnvironment, dropEvent: MockDragEvent) => {
        const targetElement: Element = document.createElement('usx-blank');
        expect(targetElement.parentElement).toBeNull('setup');
        dropEvent.setTarget(targetElement);
      });
    }));

    it('skips problem: The drag event unexpectedly has null dataTransfer information.', fakeAsync(() => {
      skipProblemTest((_env: TestEnvironment, dropEvent: MockDragEvent) => {
        dropEvent.setDataTransfer(null);
      });
    }));

    it('skips problem: target element defines no segment ref attribute ', fakeAsync(() => {
      skipProblemTest((_env: TestEnvironment, dropEvent: MockDragEvent) => {
        // Don't grab the actual target in the DOM and remove the attribute because later the quill editor selection
        // gets changed. Instead, just make a new element with no `data-segment` attribute and overwrite the target
        // with it.
        const outOfDomTargetElement: Element = document.createElement('usx-segment');
        dropEvent.setTarget(outOfDomTargetElement);
      });
    }));

    it('skips problem: TextComponent has no segment range recorded for null destination segment ref.', fakeAsync(() => {
      skipProblemTest((env: TestEnvironment, dropEvent: MockDragEvent) => {
        // An Element was written into the event target, so just cast target back to an Element.
        const targetElement: Element = dropEvent.target as Element;
        targetElement!.attributes['data-segment'].value = null;
      });
    }));

    it('skips problem: TextComponent has no segment range recorded for unfamiliar destination segment.', fakeAsync(() => {
      skipProblemTest((env: TestEnvironment, dropEvent: MockDragEvent) => {
        const targetSegmentRef = 'not_findable';
        expect(env.component!.getSegmentRange(targetSegmentRef)).not.toBeDefined('setup');
        // An Element was written into the event target, so just cast target back to an Element.
        const targetElement: Element = dropEvent.target as Element;
        targetElement!.attributes['data-segment'].value = targetSegmentRef;
      });
    }));

    it('skips problem: Firefox unexpectedly gives a null insertion position.', fakeAsync(() => {
      skipProblemTest((_env: TestEnvironment, _dropEvent: MockDragEvent) => {
        document.caretPositionFromPoint = (_x: number, _y: number) => null;
        // Remove the Chromium point-to-index method so the Firefox one will be used (in our Chromium test runner).
        (document as any).caretRangeFromPoint = undefined;
      });
    }));

    it('skips problem: No success determining insertion position.', fakeAsync(() => {
      skipProblemTest((_env: TestEnvironment, _dropEvent: MockDragEvent) => {
        // Both Chromium and Firefox point-to-index methods are unavailable for this test.
        (document as any).caretRangeFromPoint = undefined;
        (document as any).caretPositionFromPoint = undefined;
      });
    }));

    it('skips problem: start container node is null', fakeAsync(() => {
      skipProblemTest((_env: TestEnvironment, _dropEvent: MockDragEvent) => {
        // the start container of the range for the browser's point-to-index method is unavailable.
        document.caretRangeFromPoint = (_x: number, _y: number) => ({ startOffset: 0 } as Range);
      });
    }));

    // End drag-and-drop section of tests.
  });
});

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

class MockQuill extends Quill {}

@Component({
  selector: 'app-host',
  template: `<app-text
    [placeholder]="initialPlaceHolder"
    [id]="id"
    [isRightToLeft]="isTextRightToLeft"
    [isReadOnly]="isReadOnly"
  ></app-text>`
})
class HostComponent {
  @ViewChild(TextComponent) textComponent!: TextComponent;

  initialPlaceHolder = 'initial placeholder text';
  isTextRightToLeft: boolean = false;
  isReadOnly: boolean = false;
  id?: TextDocId;
}

class TestEnvironment {
  readonly component: TextComponent;
  readonly hostComponent: HostComponent;
  readonly fixture: ComponentFixture<HostComponent>;
  realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private _onlineStatus = new BehaviorSubject<boolean>(true);
  private isOnline: boolean = true;

  constructor() {
    when(mockedPwaService.onlineStatus).thenReturn(this._onlineStatus.asObservable());
    when(mockedPwaService.isOnline).thenReturn(this.isOnline);
    when(mockedTranslocoService.translate<string>(anything())).thenCall(
      (translationStringKey: string) => translationStringKey
    );

    const matTextDocId = new TextDocId('project01', 40, 1);
    const mrkTextDocId = new TextDocId('project01', 41, 1);
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
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
    when(mockedProjectService.get(anything())).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );

    this.fixture = TestBed.createComponent(HostComponent);
    this.fixture.detectChanges();
    this.component = this.fixture.componentInstance.textComponent;
    this.hostComponent = this.fixture.componentInstance;
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
    this.component.toggleFeaturedVerseRefs(true, [verseRef], 'note-thread');
    this.component.embedElementInline(verseRef, id, textAnchor, 'note-thread-embed', format);
  }
}
