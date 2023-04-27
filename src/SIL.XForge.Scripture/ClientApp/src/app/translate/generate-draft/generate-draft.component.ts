import { Component, OnInit } from '@angular/core';
import { of } from 'rxjs';
import { TextDocId } from 'src/app/core/models/text-doc';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';

@Component({
  selector: 'app-generate-draft',
  templateUrl: './generate-draft.component.html',
  styleUrls: ['./generate-draft.component.scss']
})
export class GenerateDraftComponent implements OnInit {
  constructor(private readonly dialog: DialogService, private readonly activatedProject: ActivatedProjectService) {}

  hasDraft = false;

  status: 'init' | 'queued' | 'generating' | 'generated' | 'error' = 'init';

  progress = 0;

  ngOnInit(): void {
    console.log('init');
  }

  generateDraft(): void {
    this.status = 'queued';

    setTimeout(() => this.startGenerating(), 2_000);
  }

  async cancel(): Promise<void> {
    if (this.canCancel) {
      if (this.status === 'generating') {
        const result = await this.dialog.confirm(
          of('Are you sure you want to cancel generating the draft?'),
          of('Cancel Draft Generation')
        );
        if (!result) {
          return;
        }
      }
      this.status = 'init';
    }
  }

  get canCancel(): boolean {
    return this.status === 'queued' || this.status === 'generating';
  }

  private startGenerating(): void {
    if (this.status === 'queued') {
      this.status = 'generating';

      const generationTime = 3_000;

      setInterval(() => this.progress++, generationTime / 100);

      setTimeout(() => this.finishGenerating(), generationTime);
    }
  }

  private finishGenerating(): void {
    if (this.status === 'generating') {
      this.status = 'generated';
      this.hasDraft = true;
    }
  }

  get textDocId(): TextDocId | undefined {
    const text = this.activatedProject.projectDoc?.data?.texts[0];
    const bookNum = text?.bookNum;

    if (bookNum !== undefined && this.activatedProject.projectId !== undefined) {
      return new TextDocId(this.activatedProject.projectId, bookNum, 1);
    }
    return undefined;
  }
}
