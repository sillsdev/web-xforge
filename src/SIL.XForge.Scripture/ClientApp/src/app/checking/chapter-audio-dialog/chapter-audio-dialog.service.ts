import { DialogService } from 'xforge-common/dialog.service';
import { MatLegacyDialogConfig as MatDialogConfig } from '@angular/material/legacy-dialog';
import { Injectable } from '@angular/core';
import { SFProjectService } from '../../core/sf-project.service';
import {
  ChapterAudioDialogComponent,
  ChapterAudioDialogData,
  ChapterAudioDialogResult
} from './chapter-audio-dialog.component';

@Injectable({
  providedIn: 'root'
})
export class ChapterAudioDialogService {
  constructor(private readonly dialogService: DialogService, private readonly projectService: SFProjectService) {}

  async openDialog(config: ChapterAudioDialogData): Promise<void> {
    const dialogConfig: MatDialogConfig<ChapterAudioDialogData> = {
      data: config,
      width: '320px'
    };
    const dialogRef = this.dialogService.openMatDialog(ChapterAudioDialogComponent, dialogConfig);
    const result: ChapterAudioDialogResult | 'close' | undefined = await dialogRef.afterClosed().toPromise();
    if (result == null || result === 'close') {
      return;
    }
    await this.projectService.onlineCreateAudioTimingData(
      config.projectId,
      result.book,
      result.chapter,
      result.timingData,
      result.audioUrl
    );
  }
}
