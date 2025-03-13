import { AfterViewInit, Component, DestroyRef, Input, OnChanges, ViewChild } from '@angular/core';
import { translate } from '@ngneat/transloco';
import { combineLatest, EMPTY, startWith, Subject, switchMap } from 'rxjs';
import { DialogService } from 'xforge-common/dialog.service';
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

  @ViewChild(TextComponent) resourceText!: TextComponent;

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
    private readonly fontService: FontService,
    private readonly dialogService: DialogService
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

  showCopyrightNotice(): void {
    this.dialogService.openCopyrightNoticeDialog(this.copyrightNotice ?? this.copyrightBanner ?? '');
  }

  moreInfo(): string {
    return translate('editor.more_info');
  }
}
