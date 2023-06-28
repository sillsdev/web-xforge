import { Component, EventEmitter, Output } from '@angular/core';
import { of } from 'rxjs';
import { DialogService } from 'xforge-common/dialog.service';

@Component({
  selector: 'app-draft-available-indicator',
  templateUrl: './draft-available-indicator.component.html',
  styleUrls: ['./draft-available-indicator.component.scss']
})
export class DraftAvailableIndicatorComponent {
  @Output() confirmNav = new EventEmitter();

  constructor(private readonly dialogService: DialogService) {}

  async openDialog(): Promise<void> {
    const goToPreview: boolean | undefined = await this.dialogService.openGenericDialog({
      title: of('Draft available'),
      message: of('Machine translated draft text is available for this chapter. Would you like to preview?'),
      options: [
        { value: false, label: of('Not now') },
        { value: true, label: of('Preview draft text'), highlight: true }
      ]
    });

    if (goToPreview) {
      this.confirmNav.emit();
    }
  }
}
