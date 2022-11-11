import { MdcList } from '@angular-mdc/web/list';
import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import isEqual from 'lodash-es/isEqual';
import Quill from 'quill';
import { fromEvent } from 'rxjs';
import { filter, first } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { TextComponent } from '../../shared/text/text.component';

export interface SuggestionSelectedEvent {
  suggestionIndex: number;
  wordIndex: number;
  event: Event;
}

export interface Suggestion {
  words: string[];
  confidence: number;
}

@Component({
  selector: 'app-suggestions',
  templateUrl: './suggestions.component.html',
  styleUrls: ['./suggestions.component.scss']
})
export class SuggestionsComponent extends SubscriptionDisposable implements OnDestroy {
  @Output() selected = new EventEmitter<SuggestionSelectedEvent>();
  @Output() showChange = new EventEmitter<boolean>();

  @ViewChild('list') list?: MdcList;

  showHelp: boolean = false;

  private _text?: TextComponent;
  private _suggestions: Suggestion[] = [];
  private top: number = 0;

  constructor(private readonly elemRef: ElementRef) {
    super();
    this.subscribe(fromEvent(window, 'resize'), () => this.setPosition());
    this.show = false;
    this.root.style.left = '0px';
    this.root.style.top = '0px';
  }

  get text(): TextComponent | undefined {
    return this._text;
  }

  @Input()
  set text(value: TextComponent | undefined) {
    if (this._text !== value) {
      this._text = value;
      this.initText();
    }
  }

  get suggestions(): Suggestion[] {
    return this._suggestions;
  }

  @Input()
  set suggestions(value: Suggestion[]) {
    if (!isEqual(this._suggestions, value)) {
      this._suggestions = value;
      setTimeout(() => {
        this.setPosition();
        if (this.list != null) {
          this.list.setSelectedIndex(0);
        }
      });
    }
  }

  get show(): boolean {
    return !this.root.classList.contains('hidden');
  }

  @Input()
  set show(value: boolean) {
    if (value !== this.show) {
      if (value) {
        this.root.classList.remove('hidden');
      } else {
        this.root.classList.add('hidden');
      }
      this.showChange.emit(value);
    }
  }

  get isLoading(): boolean {
    return this._suggestions.length === 0;
  }

  private get editor(): Quill | undefined {
    return this.text == null ? undefined : this.text.editor;
  }

  private get root(): HTMLElement {
    return this.elemRef.nativeElement;
  }

  toggleHelp(): void {
    this.showHelp = !this.showHelp;
  }

  selectAll(event: Event): void {
    if (this.list == null) {
      return;
    }
    this.selected.emit({ suggestionIndex: this.list.getSelectedIndex(), wordIndex: -1, event });
  }

  getPercentage(num: number): number {
    return Math.round(num * 100);
  }

  private initText(): void {
    if (this.text == null) {
      return;
    }

    this.subscribe(this.text.updated, () => this.setPosition());

    this.initEditor();
    if (this.editor == null) {
      this.text.loaded.pipe(first()).subscribe(() => this.initEditor());
    }
  }

  private initEditor(): void {
    if (this.editor == null) {
      return;
    }

    this.subscribe(fromEvent(this.editor.root, 'scroll'), () => this.setPosition());
    this.subscribe(
      fromEvent<KeyboardEvent>(this.editor.root, 'keydown').pipe(filter(event => this.isSuggestionEvent(event))),
      event => {
        if (this.list == null) {
          return;
        }
        let selectedIndex;
        switch (event.key) {
          case 'ArrowDown':
            selectedIndex = this.list.getSelectedIndex();
            if (selectedIndex === this.list.items.length - 1) {
              selectedIndex = 0;
            } else {
              selectedIndex++;
            }
            this.list.setSelectedIndex(selectedIndex);
            break;

          case 'ArrowUp':
            selectedIndex = this.list.getSelectedIndex();
            if (selectedIndex === 0) {
              selectedIndex = this.list.items.length - 1;
            } else {
              selectedIndex--;
            }
            this.list.setSelectedIndex(selectedIndex);
            break;

          case 'Enter':
            this.selected.emit({ suggestionIndex: this.list.getSelectedIndex(), wordIndex: -1, event });
            break;

          case 'Escape':
            this.show = false;
            break;

          default:
            this.selected.emit({
              suggestionIndex: this.list.getSelectedIndex(),
              wordIndex: parseInt(event.key, 10) - 1,
              event
            });
            break;
        }
        event.preventDefault();
      }
    );
  }

  private setPosition(): void {
    if (this.editor == null) {
      return;
    }
    const selection = this.editor.getSelection();
    if (selection == null) {
      return;
    }
    // If the segment is blank, then the selection is after the blank. We want to align the suggestion to the beginning
    // of the segment, so we shift the selection back one index.
    if (this.text?.segmentText === '') {
      selection.index--;
    }
    const reference = this.editor.getBounds(selection.index, selection.length);
    const left = reference.left + 1;
    // root.scrollTop should be 0 if scrollContainer !== root
    this.top = reference.bottom + this.editor.root.scrollTop + 5;
    this.root.classList.remove('flip');
    const rootBounds = this.root.getBoundingClientRect();
    const editorBounds = this.editor.scrollingContainer.getBoundingClientRect();
    const bodyBounds = document.body.getBoundingClientRect();
    const clientLeft = reference.left + editorBounds.left;
    const clientTop = reference.bottom + editorBounds.top + 5;
    if (clientLeft + rootBounds.width > bodyBounds.right) {
      const shift = bodyBounds.right - (clientLeft + rootBounds.width);
      this.root.style.left = left + shift + 'px';
    } else if (clientLeft < bodyBounds.left) {
      const shift = bodyBounds.left - clientLeft;
      this.root.style.left = left + shift + 'px';
    } else {
      this.root.style.left = left + 'px';
    }

    if (clientTop + rootBounds.height > editorBounds.bottom) {
      const verticalShift = reference.bottom - reference.top + rootBounds.height;
      this.top -= verticalShift;
      this.root.style.top = this.top + 'px';
      this.root.classList.add('flip');
    } else {
      this.root.style.top = this.top + 'px';
    }

    const marginTop = -this.editor.root.scrollTop;
    const offsetTop = marginTop + this.top;
    const offsetBottom = offsetTop + this.root.clientHeight - 10;
    if (offsetTop < 0 || offsetBottom > this.editor.scrollingContainer.clientHeight) {
      if (this.root.style.visibility !== 'hidden') {
        this.root.style.visibility = 'hidden';
        this.root.style.marginTop = -this.top + 'px';
      }
    } else {
      this.root.style.marginTop = marginTop + 'px';
      this.root.style.visibility = '';
    }
  }

  private isSuggestionEvent(event: KeyboardEvent): boolean {
    if (!this.show) {
      return false;
    }

    switch (event.key) {
      case 'Enter':
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Escape':
        return true;
      default:
        if (event.key.length !== 1) {
          return false;
        }
        const keyCode = event.key.charCodeAt(0);
        return (event.ctrlKey || event.metaKey) && keyCode >= 48 && keyCode <= 57;
    }
  }
}
