import { Component, Input } from '@angular/core';
import { I18nKey } from 'xforge-common/i18n.service';
import { TranslocoService } from '@ngneat/transloco';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-notice',
  templateUrl: './notice.component.html',
  styleUrls: ['./notice.component.scss']
})
export class NoticeComponent {
  @Input() icon?: string;
  @Input() text?: I18nKey;
  @Input() type: 'normal' | 'warning' | 'error' = 'normal';
  @Input() outline: boolean = false;

  constructor(private readonly transloco: TranslocoService) {}
  get notice(): Observable<string> | null {
    if (this.text == null) {
      return null;
    }
    return this.transloco.selectTranslate(this.text);
  }
}
