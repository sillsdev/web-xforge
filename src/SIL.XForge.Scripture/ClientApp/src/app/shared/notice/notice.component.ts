import { Component, Input } from '@angular/core';
import { ICONS_TO_MIRROR_RTL } from '../utils';

@Component({
  selector: 'app-notice',
  templateUrl: './notice.component.html',
  styleUrls: ['./notice.component.scss']
})
export class NoticeComponent {
  @Input() icon?: string;
  @Input() type: 'normal' | 'warning' | 'error' = 'normal';
  @Input() outline: boolean = false;

  constructor() {}

  get mirrorRTL(): boolean {
    return ICONS_TO_MIRROR_RTL.includes(this.icon ?? '');
  }
}
