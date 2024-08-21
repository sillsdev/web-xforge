import { Component, EventEmitter, Output } from '@angular/core';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { ActivatedProjectService } from '../../../../xforge-common/activated-project.service';
import { NoticeComponent } from '../../../shared/notice/notice.component';

@Component({
  selector: 'app-confirm-sources',
  standalone: true,
  imports: [TranslocoModule, NoticeComponent, MatCheckboxModule, MatIconModule],
  templateUrl: './confirm-sources.component.html',
  styleUrl: './confirm-sources.component.scss'
})
export class ConfirmSourcesComponent {
  @Output() languageCodesVerified = new EventEmitter<boolean>(false);

  trainingSources: TranslateSource[] = [];
  trainingTargets: SFProjectProfile[] = [];
  draftingSources: TranslateSource[] = [];

  constructor(activatedProjectService: ActivatedProjectService) {
    const project = activatedProjectService.projectDoc!.data!;
    this.trainingTargets.push(project);

    let trainingSource: TranslateSource | undefined;
    if (project.translateConfig.draftConfig.alternateTrainingSourceEnabled) {
      trainingSource = project.translateConfig.draftConfig.alternateTrainingSource;
    } else {
      trainingSource = project.translateConfig.source;
    }

    if (trainingSource != null) {
      this.trainingSources.push(trainingSource);
    }

    if (project.translateConfig.draftConfig.additionalTrainingSourceEnabled) {
      this.trainingSources.push(project.translateConfig.draftConfig.additionalTrainingSource!);
    }

    let draftingSource: TranslateSource | undefined;
    if (project.translateConfig.draftConfig.alternateSourceEnabled) {
      draftingSource = project.translateConfig.draftConfig.alternateSource;
    } else {
      draftingSource = project.translateConfig.source;
    }

    if (draftingSource != null) {
      this.draftingSources.push(draftingSource);
    }
  }

  confirmationChanged(change: MatCheckboxChange): void {
    this.languageCodesVerified.emit(change.checked);
  }
}
