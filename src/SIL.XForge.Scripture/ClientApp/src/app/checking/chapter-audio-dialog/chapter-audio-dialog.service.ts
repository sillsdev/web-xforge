import { Injectable } from '@angular/core';
import { MatDialogConfig } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { DialogService } from 'xforge-common/dialog.service';
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
  constructor(
    private readonly dialogService: DialogService,
    private readonly projectService: SFProjectService
  ) {}

  async openDialog(config: ChapterAudioDialogData): Promise<void> {
    const dialogConfig: MatDialogConfig<ChapterAudioDialogData> = {
      data: config,
      width: '320px',
      height: '440px'
    };
    const dialogRef = this.dialogService.openMatDialog(ChapterAudioDialogComponent, dialogConfig);
    const result: ChapterAudioDialogResult | 'close' | undefined = await firstValueFrom(dialogRef.afterClosed());
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
