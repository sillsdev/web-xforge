import { AfterViewInit, Component, DestroyRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { VerseRef } from '@sillsdev/scripture';
import { IOutputAreaSizes } from 'angular-split';
import { clone } from 'lodash-es';
import { fromEvent, Observable, Subscription } from 'rxjs';
import { FontService } from 'xforge-common/font.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../../core/models/text-doc';
import { TextComponent } from '../../../shared/text/text.component';
import { verseRefFromMouseEvent } from '../../../shared/utils';
@Component({
  selector: 'app-checking-text',
  templateUrl: './checking-text.component.html',
  styleUrls: ['./checking-text.component.scss']
})
export class CheckingTextComponent implements AfterViewInit {
  @ViewChild(TextComponent, { static: true }) textComponent!: TextComponent;
  @Output() questionVerseSelected = new EventEmitter<VerseRef>();
  @Input() resizableContainer?: { transitionEnd: Observable<IOutputAreaSizes> };
  @Input() isRightToLeft: boolean = false;
  @Input() fontSize?: string;
  @Input() projectDoc?: SFProjectProfileDoc;

  private clickSubs: Subscription[] = [];
  private _activeVerse?: VerseRef;
  private _id?: TextDocId;
  private _questionVerses?: VerseRef[];
  private _placeholder?: string;

  constructor(
    readonly fontService: FontService,
    private destroyRef: DestroyRef
  ) {}

  ngAfterViewInit(): void {
    if (this.resizableContainer != null) {
      this.resizableContainer.transitionEnd.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
        this.scrollToVerse(this.activeVerse);
      });
    }
  }

  @Input() set placeholder(value: string) {
    this._placeholder = value;
  }

  get placeholder(): string | undefined {
    return this._placeholder;
  }

  @Input() set activeVerse(verseRef: VerseRef | undefined) {
    if (this._activeVerse?.toString() === verseRef?.toString()) {
      return;
    }
    this._activeVerse = verseRef;
    if (verseRef !== undefined) {
      this.highlightActiveVerse();
      this.scrollToVerse(this.activeVerse);
    } else {
      this.textComponent.highlight([]);
      this.scrollTo(0);
    }
  }

  get activeVerse(): VerseRef | undefined {
    return this._activeVerse;
  }

  @Input() set id(textDocId: TextDocId | undefined) {
    if (textDocId) {
      this._id = textDocId;
    }
  }

  get id(): TextDocId | undefined {
    return this._id;
  }

  @Input() set questionVerses(verseRefs: VerseRef[] | undefined) {
    this.toggleQuestionVerses(false);
    this._questionVerses = clone(verseRefs);
    this.toggleQuestionVerses(true);
  }

  get questionVerses(): VerseRef[] | undefined {
    return this._questionVerses;
  }

  onLoaded(): void {
    this.toggleQuestionVerses(true);
    this.highlightActiveVerse();
    this.scrollToVerse(this.activeVerse);
  }

  private get isEditorLoaded(): boolean {
    return this.textComponent.editor != null;
  }

  private get questionVersesInCurrentText(): VerseRef[] {
    if (this.questionVerses == null) {
      return [];
    }
    return this.questionVerses.filter(v => v.bookNum === this.id?.bookNum && v.chapterNum === this.id?.chapterNum);
  }

  private toggleQuestionVerses(value: boolean): void {
    if (!this.isEditorLoaded || this.questionVerses == null) {
      return;
    }
    const segments: string[] = this.textComponent.toggleFeaturedVerseRefs(
      value,
      this.questionVersesInCurrentText,
      'question'
    );
    if (value) {
      this.subscribeClickEvents(segments);
    } else {
      // Un-subscribe from all segment click events as these all get setup again
      for (const event of this.clickSubs) {
        event.unsubscribe();
      }
    }
  }

  private highlightActiveVerse(): void {
    if (!this.isEditorLoaded) {
      return;
    }

    const refs: string[] =
      this._activeVerse != null ? this.textComponent.getVerseSegmentsNoHeadings(this._activeVerse) : [];
    this.textComponent.highlight(refs);
  }

  private subscribeClickEvents(segments: string[]): void {
    for (const segment of segments) {
      const element: Element | null = this.textComponent.getSegmentElement(segment);
      if (element == null) {
        continue;
      }
      this.clickSubs.push(
        fromEvent<MouseEvent>(element, 'click')
          .pipe(quietTakeUntilDestroyed(this.destroyRef))
          .subscribe(event => {
            if (this._id == null) {
              return;
            }
            const verseRef: VerseRef | undefined = verseRefFromMouseEvent(event, this._id.bookNum);
            if (verseRef != null) {
              this.questionVerseSelected.emit(verseRef);
            }
          })
      );
    }
  }

  private scrollToVerse(verseRef: VerseRef | undefined): void {
    if (verseRef != null && this.textComponent != null) {
      const firstSegment: string = this.textComponent.getVerseSegments(verseRef)[0];
      const element: HTMLElement = this.textComponent.getSegmentElement(firstSegment) as HTMLElement;
      if (element != null) {
        this.scrollTo(element.offsetTop - 20);
      }
    }
  }

  private scrollTo(y: number): void {
    const editor: Element | undefined | null = this.textComponent?.editor?.container.querySelector('.ql-editor');
    if (editor != null) {
      editor.scrollTo({ top: y, behavior: 'smooth' });
    }
  }
}
