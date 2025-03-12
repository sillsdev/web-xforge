import { AfterViewInit, Component, DestroyRef, Input, OnChanges, ViewChild } from '@angular/core';
import { combineLatest, EMPTY, of, startWith, Subject, switchMap } from 'rxjs';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { FontService } from 'xforge-common/font.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextComponent } from '../../../shared/text/text.component';
import { formatFontSizeToRems } from '../../../shared/utils';
@Component({
  selector: 'app-editor-resource',
  templateUrl: './editor-resource.component.html',
  styleUrl: '../editor.component.scss'
})
export class EditorResourceComponent implements AfterViewInit, OnChanges {
  @Input() projectId?: string;
  @Input() bookNum?: number;
  @Input() chapter?: number;
  @Input() segmentRef?: string;
  @Input() highlightSegment?: boolean;

  @ViewChild(TextComponent) resourceText?: TextComponent;

  isRightToLeft = false;
  fontSize?: string;
  font?: string;
  hasCopyrightBanner: boolean = false;
  copyrightBanner?: string;
  copyrightNotice?: string;

  inputChanged$ = new Subject<void>();

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly projectService: SFProjectService,
    protected readonly featureFlags: FeatureFlagService,
    private readonly fontService: FontService
  ) {}

  ngOnChanges(): void {
    this.inputChanged$.next();
  }

  ngAfterViewInit(): void {
    this.initProjectDetails();
  }

  private initProjectDetails(): void {
    combineLatest([
      this.resourceText?.editorCreated ?? of(undefined),
      this.inputChanged$.pipe(startWith(undefined)),
      this.featureFlags.usePlatformBibleEditor.enabled$
    ])
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        switchMap(() => {
          if (this.projectId == null || this.bookNum == null || this.chapter == null) {
            return EMPTY;
          }

          return this.projectService.getProfile(this.projectId);
        })
      )
      .subscribe((projectDoc: SFProjectProfileDoc) => {
        this.hasCopyrightBanner = projectDoc.data?.copyrightBanner != null;
        this.copyrightBanner = projectDoc.data?.copyrightBanner ?? '';
        this.copyrightNotice = projectDoc.data?.copyrightNotice;
        this.isRightToLeft = projectDoc.data?.isRightToLeft ?? false;
        this.fontSize = formatFontSizeToRems(projectDoc.data?.defaultFontSize);
        this.font = this.fontService.getFontFamilyFromProject(projectDoc);
      });
  }
}
