import { Component, EventEmitter, Input, Output, ViewChild, ViewEncapsulation } from '@angular/core';
import isEqual from 'lodash/isEqual';
import { fromVerseRef, toVerseRef, VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { fromEvent } from 'rxjs';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { Anchorable } from '../../../core/models/anchorable';
import { TextDocId } from '../../../core/models/text-doc';
import { TextComponent } from '../../../shared/text/text.component';

@Component({
  selector: 'app-checking-text',
  templateUrl: './checking-text.component.html',
  styleUrls: ['./checking-text.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class CheckingTextComponent extends SubscriptionDisposable {
  @ViewChild(TextComponent, { static: true }) textComponent: TextComponent;

  @Input() set activeObject(obj: Readonly<Anchorable>) {
    if (this.activeObject && this.isEditorLoaded) {
      // Removed the highlight on the old active object
      this.highlightActiveObject(this.activeObject, false);
      if (obj != null) {
        this.highlightActiveObject(obj, true);
      }
    }
    this._activeObject = obj;
  }
  @Input() set id(textDocId: TextDocId) {
    if (textDocId) {
      if (this.isEditorLoaded && !isEqual(this._id, textDocId)) {
        this._editorLoaded = false;
      }
      this._id = textDocId;
    }
  }
  @Output() objectClicked: EventEmitter<Anchorable> = new EventEmitter<Anchorable>();
  @Input() objects: Readonly<Anchorable[]> = [];
  @Input() mode: 'checking' | 'dialog' = 'checking';

  private _activeObject: Readonly<Anchorable>;
  private _editorLoaded = false;
  private _id: TextDocId;

  get activeObject(): Readonly<Anchorable> {
    return this._activeObject;
  }

  get isEditorLoaded(): boolean {
    return this._editorLoaded;
  }

  get id() {
    return this._id;
  }

  applyFontChange(fontSize: string) {
    this.textComponent.editorStyles = {
      fontSize: fontSize
    };
  }

  highlightObjects() {
    this._editorLoaded = true;
    if (this.mode === 'checking') {
      if (this.objects) {
        const segments: string[] = [];
        for (const obj of this.objects) {
          const referenceSegments = this.getObjectSegments(obj);
          if (referenceSegments.length) {
            this.setupQuestionSegments([referenceSegments[0]]);
            for (const segment of referenceSegments) {
              if (!segments.includes(segment)) {
                segments.push(segment);
              }
            }
          }
        }
        this.highlightSegments(segments);
        if (this.activeObject) {
          this.selectActiveObject(this.activeObject, true);
        }
      }
    } else {
      // In dialog mode, highlight the active object without putting the ? marker before the text
      this.highlightActiveObject(this._activeObject, true);
    }
  }

  highlightActiveObject(obj: Anchorable, toggle: boolean) {
    if (this.mode === 'dialog') {
      const segments = this.getObjectSegments(obj);
      this.highlightSegments(segments, toggle);
    }
    this.selectActiveObject(obj, toggle);
  }

  private getObjectSegments(obj: Anchorable): string[] {
    const segments: string[] = [];
    let segment = '';
    if (obj.verseRef != null) {
      for (const verseInRange of obj.verseRef.allVerses()) {
        segment = this.getSegment(verseInRange.chapterNum, verseInRange.verseNum);
        if (!segments.includes(segment)) {
          segments.push(segment);
        }
      }
    }
    return segments;
  }

  private getSegment(chapter: number, verse: number) {
    return 'verse_' + chapter + '_' + verse;
  }

  private highlightSegments(segments: string[], toggle = true) {
    for (const segment of segments) {
      if (!this.textComponent.hasSegmentRange(segment)) {
        continue;
      }
      const range = this.textComponent.getSegmentRange(segment);
      this.textComponent.toggleHighlight(toggle, range);
      if (this.mode === 'dialog') {
        continue;
      }
      const element = this.textComponent.editor.container.querySelector('usx-segment[data-segment=' + segment + ']');
      this.subscribe(fromEvent(element, 'click'), (event: MouseEvent) => {
        let target = event.target;
        if (target['offsetParent']['nodeName'] === 'USX-SEGMENT') {
          target = target['offsetParent'];
        }
        if (target['nodeName'] === 'USX-SEGMENT') {
          const clickSegment = target['attributes']['data-segment'].value;
          const segmentParts = clickSegment.split('_', 3);
          const verseRef = new VerseRef(this._id.bookNum, segmentParts[1], segmentParts[2]);
          const verseRefData = fromVerseRef(verseRef);
          this.segmentClicked(verseRefData);
        }
      });
    }
  }

  private segmentClicked(verseRefData: VerseRefData) {
    const verseRef = toVerseRef(verseRefData);
    let bestMatch: Anchorable = {};

    for (const obj of this.objects) {
      if (obj.verseRef.chapterNum === verseRef.chapterNum && obj.verseRef.verseNum === verseRef.verseNum) {
        bestMatch = obj;
        break;
      } else if (obj.verseRef.chapterNum === verseRef.chapterNum && obj.verseRef.verseNum <= verseRef.verseNum) {
        const allVerses = obj.verseRef.allVerses(true);
        const endRef = allVerses[allVerses.length - 1];
        if (endRef.verseNum >= verseRef.verseNum) {
          bestMatch = obj;
        }
      }
    }
    if (bestMatch) {
      this.objectClicked.emit(bestMatch);
    }
  }

  private setupQuestionSegments(segments: string[]) {
    for (const segment of segments) {
      if (!this.textComponent.hasSegmentRange(segment)) {
        continue;
      }
      const range = this.textComponent.getSegmentRange(segment);
      Promise.resolve().then(() => {
        this.textComponent.editor.formatText(range.index, range.length, 'data-question', 'true', 'silent');
      });
    }
  }

  private selectActiveObject(obj: Anchorable, toggle: boolean) {
    for (const segment of this.getObjectSegments(obj)) {
      if (!this.textComponent.hasSegmentRange(segment)) {
        continue;
      }
      const range = this.textComponent.getSegmentRange(segment);
      Promise.resolve().then(() => {
        this.textComponent.editor.formatText(
          range.index,
          range.length,
          'data-selected',
          toggle ? 'true' : false,
          'silent'
        );
      });
    }
  }
}
