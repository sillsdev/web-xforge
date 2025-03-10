import { AfterViewInit, Component, Input, OnChanges, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, EMPTY, startWith, Subject, switchMap } from 'rxjs';
import { FontService } from 'xforge-common/font.service';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { QuietDestroyRef } from 'xforge-common/utils';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextComponent } from '../../../shared/text/text.component';
import { formatFontSizeToRems } from '../../../shared/utils';

@Component({
  selector: 'app-editor-resource',
  templateUrl: './editor-resource.component.html'
})
export class EditorResourceComponent implements AfterViewInit, OnChanges {
  @Input() projectId?: string;
  @Input() bookNum?: number;
  @Input() chapter?: number;
  @Input() segmentRef?: string;
  @Input() highlightSegment?: boolean;

  @ViewChild(TextComponent) resourceText!: TextComponent;

  isRightToLeft = false;
  fontSize?: string;
  font?: string;

  inputChanged$ = new Subject<void>();

  constructor(
    private readonly destroyRef: QuietDestroyRef,
    private readonly projectService: SFProjectService,
    private readonly fontService: FontService
  ) {}

  ngOnChanges(): void {
    this.inputChanged$.next();
  }

  ngAfterViewInit(): void {
    this.initProjectDetails();
  }

  private initProjectDetails(): void {
    combineLatest([this.resourceText.editorCreated, this.inputChanged$.pipe(startWith(undefined))])
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap(() => {
          if (this.projectId == null || this.bookNum == null || this.chapter == null) {
            return EMPTY;
          }

          return this.projectService.getProfile(this.projectId, new DocSubscription('EditorResourceComponent'));
        })
      )
      .subscribe((projectDoc: SFProjectProfileDoc) => {
        this.isRightToLeft = projectDoc.data?.isRightToLeft ?? false;
        this.fontSize = formatFontSizeToRems(projectDoc.data?.defaultFontSize);
        this.font = this.fontService.getFontFamilyFromProject(projectDoc);
      });
  }
}
