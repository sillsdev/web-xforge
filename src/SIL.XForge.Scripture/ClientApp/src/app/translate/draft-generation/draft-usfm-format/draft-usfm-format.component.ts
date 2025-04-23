import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SharedModule } from '../../../shared/shared.module';
import { TranslateModule } from '../../translate.module';

@Component({
  selector: 'app-draft-usfm-format',
  standalone: true,
  imports: [UICommonModule, CommonModule, TranslateModule, SharedModule],
  templateUrl: './draft-usfm-format.component.html',
  styleUrl: './draft-usfm-format.component.scss'
})
export class DraftUsfmFormatComponent {
  preserveParagraph: boolean = true;
  preserveStyles: boolean = false;
  preserveEmbeds: boolean = true;

  constructor(private readonly activatedProjectService: ActivatedProjectService) {}

  get projectId(): string | undefined {
    return this.activatedProjectService.projectId;
  }

  get isRightToLeft(): boolean {
    return !!this.activatedProjectService.projectDoc?.data?.isRightToLeft;
  }
}
