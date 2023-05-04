import { Component, Input, OnInit } from '@angular/core';
import {
  createInteractiveTranslator,
  ErrorCorrectionModel,
  PhraseTranslationSuggester,
  TranslationSuggester
} from '@sillsdev/machine';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';
import { USFM_STYLE_DESCRIPTIONS } from 'src/app/shared/text/usfm-style-descriptions';
import { getVerseRefFromSegmentRef } from 'src/app/shared/utils';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';

@Component({
  selector: 'app-line-by-line-editor',
  templateUrl: './line-by-line-editor.component.html',
  styleUrls: ['./line-by-line-editor.component.scss']
})
export class LineByLineEditorComponent extends SubscriptionDisposable implements OnInit {
  _bookNum?: number;
  _chapterNum?: number;

  @Input() set chapterNum(value: number | undefined) {
    this._chapterNum = value;
    this.loadText();
  }
  @Input() set bookNum(value: number | undefined) {
    this._bookNum = value;
    this.loadText();
  }

  get chapterNum(): number | undefined {
    return this._chapterNum;
  }
  get bookNum(): number | undefined {
    return this._bookNum;
  }

  editableOpIndex = 0;
  activeOp: unknown;

  projectDoc: SFProjectProfileDoc | undefined;
  textDoc: TextDoc | undefined;
  sourceDoc: TextDoc | undefined;

  private readonly translationSuggester: TranslationSuggester = new PhraseTranslationSuggester();

  constructor(
    private readonly projectService: SFProjectService,
    private readonly activatedProject: ActivatedProjectService
  ) {
    super();
    this.subscribe(this.activatedProject.projectId$, () => this.loadText());
    this.subscribe(this.activatedProject.projectDoc$, projectDoc => (this.projectDoc = projectDoc));

    this.translationSuggester.confidenceThreshold = 0;
  }

  ngOnInit(): void {
    console.log('LineByLineEditorComponent.ngOnInit');
  }

  async loadText(): Promise<void> {
    console.log(this.activatedProject.projectId, this.bookNum, this.chapterNum);

    if (this.activatedProject.projectId == null || this.bookNum == null || this.chapterNum == null) return;
    const id = new TextDocId(this.activatedProject.projectId, this.bookNum, this.chapterNum);
    this.textDoc = await this.projectService.getText(id);
    this.activeOp = this.editableOps[0];

    await this.loadSource();

    console.log(this.textDoc?.data?.ops);
    console.log(this.sourceDoc?.data?.ops);
  }

  async loadSource(): Promise<void> {
    const project = this.projectDoc?.data;
    const sourceId = project?.translateConfig.source?.projectRef;
    const sourceText = project?.texts.find(text => text.bookNum === this.bookNum);
    if (sourceId != null && sourceText?.hasSource && this.bookNum != null && this.chapterNum != null) {
      this.sourceDoc = await this.projectService.getText(new TextDocId(sourceId, this.bookNum, this.chapterNum));
    } else {
      this.sourceDoc = undefined;
    }
  }

  get editableOps(): unknown[] {
    return (
      this.textDoc?.data?.ops?.filter(
        op => op.attributes?.segment != null && !['m'].includes(this.getUSFMTagFromSegment(op.attributes.segment))
      ) ?? []
    );
  }

  get activeSegment(): string | undefined {
    return (this.activeOp as any)?.attributes?.segment;
  }

  get currentSourceText(): string {
    const sourceOp = this.sourceDoc?.data?.ops?.find(op => op.attributes?.segment === this.activeSegment);
    if (typeof sourceOp?.insert === 'object') {
      return '';
    }
    return sourceOp?.insert ?? '';
  }

  get currentTargetText(): string {
    return this.activeSegmentContent;
  }

  firstWordTrimmed = false;

  get suggestionWords(): string[] {
    return ['suggestionWords'];
    // const suggestion = this.suggestions[0] as Suggestion | undefined;
    // if (suggestion == null) return [];

    // const firstWord = suggestion.words[0];
    // const alreadyUsed =
    //   firstWord != null &&
    //   this.currentTargetText.lastIndexOf(firstWord) === this.currentTargetText.length - firstWord.length;

    // if (alreadyUsed) {
    //   this.firstWordTrimmed = true;
    //   return suggestion.words.slice(1);
    // } else {
    //   return suggestion.words;
    // }
  }

  get suggestionText(): string {
    return 'suggestionText';
    // const suggestion: Suggestion | undefined = this.suggestions[0];
    // return suggestion?.words.join(' ');
  }

  inputKeyDown(_event: KeyboardEvent): void {
    console.log('LineByLineEditorComponent.inputKeyDown');
    // if (event.key === 'Enter') {
    //   const input = this.lineByLineInput?.nativeElement;
    //   const range = this.target?.segment?.range;
    //   if (input != null && range != null) {
    //     const addSpace = input.value.length > 0 && input[input.value.length - 1] !== ' ';
    //     const textToInsert = (addSpace ? ' ' : '') + this.suggestionWords[0];
    //     input.value += textToInsert;
    //     const suggestionWordIndex = this.firstWordTrimmed ? 1 : 0;
    //     this.insertSuggestion(0, suggestionWordIndex, event);
    //     // this.target?.editor?.insertText(range.index, textToInsert, 'silent');
    //     // this.target?.editor?.setSelection(range.index + textToInsert.length);
    //     this.segmentUpdated$.next();
    //     input.focus();
    //   }
    //   event.preventDefault();
    // }
  }

  getUSFMTagFromSegment(segment: string): string {
    return segment.split('_')[0];
  }

  get currentVerseRefForDisplay(): string {
    if (this.activeSegment == null) return '';
    const verseRef = getVerseRefFromSegmentRef(this.bookNum!, this.activeSegment)?.toString();
    if (verseRef != null) return verseRef;
    const segmentDescriptor = (this.activeOp as any)?.attributes?.segment;
    const style = segmentDescriptor?.split('_')[0];
    const description = USFM_STYLE_DESCRIPTIONS[style];
    const separator = ' - ';
    return description.slice(description.indexOf(separator) + separator.length);
  }

  get activeSegmentContent(): string {
    const insert = this.textDoc?.data?.ops?.filter(op => op.attributes?.segment === this.activeSegment)[0]?.insert;
    return typeof insert === 'string' ? insert : '';
  }

  async getSuggestions(): Promise<void> {
    // const translator = await createInteractiveTranslator(new ErrorCorrectionModel(), this.translationEngine, words);
    // translator.setPrefix([''], false);
    // this.translationSuggester;
  }

  nextSegment(): void {
    this.editableOpIndex = (this.editableOpIndex + 1) % this.editableOps.length;
    this.activeOp = this.editableOps[this.editableOpIndex];

    this.getSuggestions();
  }

  previousSegment(): void {
    this.editableOpIndex = (this.editableOpIndex - 1 + this.editableOps.length) % this.editableOps.length;
    this.activeOp = this.editableOps[this.editableOpIndex];
  }
}
