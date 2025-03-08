import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatListOption, MatSelectionList } from '@angular/material/list';
import { isEqual } from 'lodash-es';
import Quill from 'quill';
import { fromEvent } from 'rxjs';
import { filter, first } from 'rxjs/operators';
import { QuietDestroyRef } from 'xforge-common/utils';
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
export class SuggestionsComponent {
  @Output() selected = new EventEmitter<SuggestionSelectedEvent>();
  @Output() showChange = new EventEmitter<boolean>();

  @ViewChild('list') list?: MatSelectionList;

  showHelp: boolean = false;

  private _text?: TextComponent;
  private _suggestions: Suggestion[] = [];
  private resizeObserver?: ResizeObserver;
  private top: number = 0;

  constructor(
    private readonly elemRef: ElementRef,
    private destroyRef: QuietDestroyRef
  ) {
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
      });
    }
  }

  private getSelectedIndex(): number {
    if (this.list != null) {
      const selected = this.list.selectedOptions.selected[0];
      return this.list.options.toArray().indexOf(selected);
    }

    return -1;
  }

  private setSelectedIndex(index: number): void {
    const option: MatListOption | undefined = this.list?.options.get(index);
    if (option != null) option.selected = true;
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
    this.selected.emit({ suggestionIndex: this.getSelectedIndex(), wordIndex: -1, event });
  }

  getPercentage(num: number): number {
    return Math.round(num * 100);
  }

  private initText(): void {
    if (this.text == null) {
      return;
    }

    this.text.updated.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.setPosition());

    this.initEditor();
    if (this.editor == null) {
      this.text.loaded.pipe(first()).subscribe(() => this.initEditor());
    }
  }

  private initEditor(): void {
    if (this.editor == null) {
      return;
    }

    this.observeResize(this.editor);
    fromEvent(this.editor.root, 'scroll')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.setPosition());
    fromEvent<KeyboardEvent>(this.editor.root, 'keydown')
      .pipe(
        filter(event => this.isSuggestionEvent(event)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(event => {
        if (this.list == null) {
          return;
        }
        let selectedIndex;
        switch (event.key) {
          case 'ArrowDown':
            selectedIndex = this.getSelectedIndex();
            if (selectedIndex === this.list.options.length - 1) {
              selectedIndex = 0;
            } else {
              selectedIndex++;
            }
            this.setSelectedIndex(selectedIndex);
            break;

          case 'ArrowUp':
            selectedIndex = this.getSelectedIndex();
            if (selectedIndex === 0) {
              selectedIndex = this.list.options.length - 1;
            } else {
              selectedIndex--;
            }
            this.setSelectedIndex(selectedIndex);
            break;

          case 'Enter':
            this.selected.emit({ suggestionIndex: this.getSelectedIndex(), wordIndex: -1, event });
            break;

          case 'Escape':
            this.show = false;
            break;

          default:
            this.selected.emit({
              suggestionIndex: this.getSelectedIndex(),
              wordIndex: parseInt(event.key, 10) - 1,
              event
            });
            break;
        }
        event.preventDefault();
      });
  }

  private observeResize(editor: Quill): void {
    this.resizeObserver?.unobserve(editor.root);
    this.resizeObserver = new ResizeObserver(entries => {
      entries.forEach(_ => {
        this.setPosition();
      });
    });
    this.resizeObserver.observe(editor.root);
  }

  private setPosition(): void {
    if (this.editor == null) {
      return;
    }
    const selection = this.editor.getSelection();
    if (selection == null) {
      // Reset to the top left/right, as the suggestions are hidden
      this.root.style.left = '';
      this.root.style.right = '';
      this.root.style.top = '';
      return;
    }
    // If the segment is blank, then the selection is after the blank. We want to align the suggestion to the beginning
    // of the segment, so we shift the selection back one index.
    if (this.text?.segmentText === '') {
      selection.index--;
    }
    const reference = this.editor.getBounds(selection.index, selection.length);
    // root.scrollTop should be 0 if scrollContainer !== root
    this.top = reference!.bottom + this.editor.root.scrollTop + 5;
    const suggestionBounds = this.root.getBoundingClientRect();
    const editorBounds = this.editor.root.getBoundingClientRect();

    let newLeft: number | undefined = reference!.left + 1;
    let newRight: number | undefined = editorBounds.width - reference!.left - 1;
    const leftExceedsBounds = newLeft + suggestionBounds.width > editorBounds.width;
    const rightExceedsBounds = newRight + suggestionBounds.width > editorBounds.width;
    if ((this.text?.isRtl && !rightExceedsBounds) || (leftExceedsBounds && newRight < newLeft)) {
      newLeft = undefined;
    } else {
      newRight = undefined;
    }
    this.root.style.left = newLeft ? newLeft + 'px' : '';
    this.root.style.right = newRight ? newRight + 'px' : '';
    this.root.style.top = this.top + 'px';

    const marginTop = -this.editor.root.scrollTop;
    const offsetTop = marginTop + this.top;
    const offsetBottom = offsetTop + this.root.clientHeight - 10;
    if (offsetTop < 0 || offsetBottom > this.editor.root.clientHeight) {
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
