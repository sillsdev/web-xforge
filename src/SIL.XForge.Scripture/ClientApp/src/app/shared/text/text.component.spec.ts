import { CommonModule } from '@angular/common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { TranslocoService } from '@ngneat/transloco';
import Quill, { RangeStatic } from 'quill';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TextAnchor } from 'realtime-server/lib/esm/scriptureforge/models/text-anchor';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import * as RichText from 'rich-text';
import { BehaviorSubject } from 'rxjs';
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
import { getSFProject, getTextDoc } from '../test-utils';
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
      tick();

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

    it('inserts externally introduced data in the right place with embeds minus formatting', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.embeddedElement(4);
      tick();
      const initialTextInDoc = 'target: chapter 1, verse 4.';
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
      // The length into this text node that will be returned by caretRangeFromPoint
      const textNodeIndex: number = 'chapter 1, '.length;
      document.caretRangeFromPoint = (_x: number, _y: number) =>
        ({ startOffset: textNodeIndex, startContainer } as Range);

      // SUT
      env.component.editor?.container.dispatchEvent(dragEvent);
      tick();

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

    it('also works in Firefox', fakeAsync(() => {
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
      tick();

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

    it('also works for segment embeds in Firefox', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.id = new TextDocId('project01', 40, 1);
      tick();
      env.embeddedElement(4);
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

      const textNodeIndex = 'chapter 1, '.length;
      // Override the Firefox point-to-index method behaviour to simulate actually pointing to a location
      // when dropping.
      const offsetNode: Node = targetElement!.childNodes[2] as Node;
      document.caretPositionFromPoint = (_x: number, _y: number) =>
        ({ offset: textNodeIndex, offsetNode } as CaretPosition);
      // Remove the Chromium point-to-index method so the Firefox one will be used (in our Chromium test runner).
      (document as any).caretRangeFromPoint = undefined;

      // SUT
      const cancelled = !env.component.editor?.container.dispatchEvent(dragEvent);
      tick();

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
      tick();

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
      tick();

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
      tick();

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
      tick();

      // No change to text. No insert or delete.
      expect(env.component.getSegmentText(targetSegmentRef)).toEqual(initialTextInDoc);
      expect(env.component.editor?.getText()).toContain(initialTextInDoc);
      expect(env.component.editor!.getText()).toEqual(originalAllText, 'should be unchanged');
      // event.preventDefault() should have been called as normal to prevent the browser from doing its own
      // drag-and-drop.
      expect(cancelled).toBeTrue();
      expect(env.component.editor!.getSelection()).toEqual(selection, 'selection should not have been changed');
    }));

    it('allow drag-and-drop to blank verse', fakeAsync(() => {
      // User drags to a blank verse. The target will be a usx-blank element rather than a usx-segment element. Insert
      // the text.
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

      // SUT
      const cancelled: boolean = !env.component.editor?.container.dispatchEvent(dropEvent);
      tick();

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
      tick();

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
    [isReadOnly]="false"
  ></app-text>`
})
class HostComponent {
  @ViewChild(TextComponent) textComponent!: TextComponent;

  initialPlaceHolder = 'initial placeholder text';
  isTextRightToLeft: boolean = false;
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

    const textDocId = new TextDocId('project01', 40, 1);
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'project01',
      data: getSFProject('project01')
    });
    this.realtimeService.addSnapshot<TextData>(TextDoc.COLLECTION, {
      id: textDocId.toString(),
      data: getTextDoc(textDocId),
      type: RichText.type.name
    });

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

  embeddedElement(verse: number): void {
    const verseRef: VerseRef = VerseRef.parse(`MAT 1:${verse}`);
    const id: string = `embedid${verse}`;
    const textAnchor: TextAnchor = { start: 8, length: 9 };
    const iconSource: string = '--icon-file: url(/assets/icons/TagIcons/01flag1.png)';
    const text: string = `text message on ${id}`;
    const format = { iconsrc: iconSource, preview: text, threadid: id };
    this.component.toggleFeaturedVerseRefs(true, [verseRef], 'note-thread');
    this.component.embedElementInline(verseRef, id, textAnchor, 'note-thread-embed', format);
  }
}
