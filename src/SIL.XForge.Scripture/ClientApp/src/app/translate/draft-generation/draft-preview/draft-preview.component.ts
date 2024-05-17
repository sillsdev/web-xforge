import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { EditorTabPersistData } from 'realtime-server/lib/esm/scriptureforge/models/editor-tab-persist-data';
import { TextInfo } from 'realtime-server/scriptureforge/models/text-info';
import { Subject } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectUserConfigDoc } from '../../../core/models/sf-project-user-config-doc';
import { SFProjectService } from '../../../core/sf-project.service';

@Component({
  selector: 'app-draft-preview',
  standalone: true,
  templateUrl: './draft-preview.component.html',
  styleUrls: ['./draft-preview.component.scss'],
  imports: [CommonModule, UICommonModule]
})
export class DraftPreviewComponent extends SubscriptionDisposable implements OnInit {
  booksWithDrafts$ = new Subject<number[]>();

  private projectUserConfigDoc: SFProjectUserConfigDoc | undefined;
  private textsWithDrafts: Map<number, number[]> = new Map<number, number[]>();

  constructor(
    private readonly router: Router,
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    private readonly activatedProject: ActivatedProjectService,
    readonly i18n: I18nService
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(this.activatedProject.changes$.pipe(filterNullish()), async projectDoc => {
      this.projectUserConfigDoc = await this.projectService.getUserConfig(
        projectDoc.id,
        this.userService.currentUserId
      );
      const texts: TextInfo[] = projectDoc.data?.texts ?? [];

      // Find all chapters of every book that has a draft
      texts.forEach(text => {
        const bookNum: number = text.bookNum;
        const chaptersWithDrafts: number[] = text.chapters
          .filter(chapter => chapter.hasDraft)
          .map(chapter => chapter.number);
        if (chaptersWithDrafts.length > 0) {
          this.textsWithDrafts.set(bookNum, chaptersWithDrafts);
        }
      });
      this.booksWithDrafts$.next(Array.from(this.textsWithDrafts.keys()));
    });
  }

  /** Navigate to the draft preview for the given book number. */
  async navigateToDraftPreview(bookNumber: number): Promise<void> {
    await this.persistEditorDraftTab();
    const textChaptersWithDrafts: number[] | undefined = this.textsWithDrafts.get(bookNumber);
    const chapterNum: number = textChaptersWithDrafts == null ? 1 : textChaptersWithDrafts[0];
    this.router.navigate([
      'projects',
      this.activatedProject.projectId!,
      'translate',
      Canon.bookNumberToId(bookNumber),
      chapterNum
    ]);
  }

  private async persistEditorDraftTab(): Promise<void> {
    if (this.projectUserConfigDoc == null) return;

    const tab: EditorTabPersistData = {
      groupId: 'target',
      tabType: 'draft',
      isSelected: true
    };

    await this.projectUserConfigDoc.addTab(tab);
  }
}
