import { EventEmitter, Injectable } from '@angular/core';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';
import { TextDocId } from 'src/app/core/models/text-doc';
import { SFProjectService } from 'src/app/core/sf-project.service';

@Injectable({
  providedIn: 'root'
})
export class CacheService {
  private abortCurrent: EventEmitter<void> = new EventEmitter();
  constructor(private readonly projectService: SFProjectService) {}

  async cache(project: SFProjectProfileDoc): Promise<void> {
    this.abortCurrent.emit();
    await this.loadAllChapters(project);
  }

  private async loadAllChapters(project: SFProjectProfileDoc): Promise<void> {
    var abort = false;
    const sub = this.abortCurrent.subscribe(() => (abort = true));

    if (project?.data != null) {
      for (const text of project.data.texts) {
        for (const chapter of text.chapters) {
          if (abort) {
            sub.unsubscribe();
            return;
          }

          const textDocId = new TextDocId(project.id, text.bookNum, chapter.number, 'target');
          await this.projectService.getText(textDocId);
        }
      }
    }
  }
}
