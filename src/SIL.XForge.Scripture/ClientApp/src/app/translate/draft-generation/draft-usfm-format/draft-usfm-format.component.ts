import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, EventEmitter, ViewChild } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { Delta } from 'quill';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { DraftUsfmConfig } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, first, Subject, switchMap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { SharedModule } from '../../../shared/shared.module';
import { TextComponent } from '../../../shared/text/text.component';
import { DraftHandlingService } from '../draft-handling.service';

@Component({
  selector: 'app-draft-usfm-format',
  standalone: true,
  imports: [UICommonModule, CommonModule, SharedModule],
  templateUrl: './draft-usfm-format.component.html',
  styleUrl: './draft-usfm-format.component.scss'
})
export class DraftUsfmFormatComponent implements AfterViewInit {
  @ViewChild(TextComponent) draftText!: TextComponent;
  bookNum: number = 1;
  booksWithDrafts: number[] = [];
  chapterNum: number = 1;
  chapters: number[] = [];

  usfmFormatForm: FormGroup = new FormGroup({
    preserveParagraphs: new FormControl(),
    preserveStyles: new FormControl(),
    preserveEmbeds: new FormControl()
  });

  private updateDraftText$: Subject<void> = new Subject<void>();

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly draftHandlingService: DraftHandlingService,
    private readonly projectService: SFProjectService,
    private readonly router: Router,
    private destroyRef: DestroyRef
  ) {}

  get projectId(): string | undefined {
    return this.activatedProjectService.projectId;
  }

  get isRightToLeft(): boolean {
    return !!this.activatedProjectService.projectDoc?.data?.isRightToLeft;
  }

  get textDocId(): TextDocId | undefined {
    if (this.projectId == null) return undefined;
    return new TextDocId(this.projectId, this.bookNum, this.chapterNum);
  }

  ngAfterViewInit(): void {
    combineLatest([this.activatedProjectService.projectDoc$, this.draftText.editorCreated as EventEmitter<void>])
      .pipe(first(), quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(([projectDoc]) => {
        if (projectDoc?.data == null) return;
        this.setUsfmConfig(projectDoc.data.translateConfig.draftConfig.usfmConfig);
        const texts: TextInfo[] = projectDoc.data.texts;
        this.booksWithDrafts = texts.filter(t => t.chapters.some(c => c.hasDraft)).map(t => t.bookNum);

        if (this.booksWithDrafts.length === 0) return;
        this.bookNum = this.booksWithDrafts[0];
        this.chapters = texts.find(t => t.bookNum === this.bookNum)?.chapters.map(c => c.number) ?? [];
        this.chapterNum = this.chapters[0] ?? 1;
        this.updateDraftText$.next();
      });

    this.setTextContent();
  }

  async formatUpdated(): Promise<void> {
    await this.projectService.onlineSetUsfmConfig(this.projectId!, {
      preserveParagraphMarkers: this.usfmFormatForm.controls.preserveParagraphs.value,
      preserveStyleMarkers: this.usfmFormatForm.controls.preserveStyles.value,
      preserveEmbedMarkers: this.usfmFormatForm.controls.preserveEmbeds.value
    });
    this.updateDraftText$.next();
  }

  finished(): void {
    this.router.navigate(['projects', this.projectId, 'draft-generation']);
  }

  private async setTextContent(): Promise<void> {
    this.updateDraftText$
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        switchMap(() =>
          this.draftHandlingService.getDraft(this.textDocId!, { isDraftLegacy: false, accessSnapshot: false })
        )
      )
      .subscribe(ops => {
        const draftDelta: Delta = new Delta(this.draftHandlingService.draftDataToOps(ops, []));
        this.draftText.setContents(draftDelta);
      });
  }

  private setUsfmConfig(config?: DraftUsfmConfig): void {
    config ??= {
      preserveParagraphMarkers: true,
      preserveStyleMarkers: false,
      preserveEmbedMarkers: true
    };

    this.usfmFormatForm.setValue({
      preserveParagraphs: config.preserveParagraphMarkers,
      preserveStyles: config.preserveStyleMarkers,
      preserveEmbeds: config.preserveEmbedMarkers
    });
    this.usfmFormatForm.valueChanges.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.formatUpdated();
    });
  }
}
