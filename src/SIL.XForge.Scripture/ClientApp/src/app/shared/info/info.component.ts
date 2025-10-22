import { Component, Input } from '@angular/core';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { ICONS_TO_MIRROR_RTL } from '../utils';

@Component({
  selector: 'app-info',
  templateUrl: './info.component.html',
  styleUrls: ['./info.component.scss'],
  imports: [MatTooltip, MatIcon]
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
