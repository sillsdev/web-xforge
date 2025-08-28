import { Component, Input } from '@angular/core';
import { ICONS_TO_MIRROR_RTL } from '../utils';

@Component({
    selector: 'app-info',
    templateUrl: './info.component.html',
    styleUrls: ['./info.component.scss'],
    standalone: false
})
export class InfoComponent {
  @Input() icon?: string = 'help';
  @Input() type: 'normal' | 'warning' | 'error' = 'normal';
  @Input() text: string = '';

  constructor() {}

  get mirrorRTL(): boolean {
    return ICONS_TO_MIRROR_RTL.has(this.icon);
  }
}
