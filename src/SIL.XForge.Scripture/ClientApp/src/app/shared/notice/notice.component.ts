import { CommonModule } from '@angular/common';
import { Component, HostBinding, Input, OnChanges } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ICONS_TO_MIRROR_RTL } from '../utils';
import { NoticeMode, NoticeType } from './notice.types';

@Component({
  selector: 'app-notice',
  templateUrl: './notice.component.html',
  styleUrls: ['./notice.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule]
})
export class NoticeComponent implements OnChanges {
  @Input() type: NoticeType = 'primary';
  @Input() mode: NoticeMode = 'fill-dark';
  @Input() icon?: string;
  // TODO: remove 'outline' once all components are migrated to use 'mode'
  @Input() outline: boolean = false;

  @HostBinding('class') classes!: string;

  readonly mirrorRtl = ICONS_TO_MIRROR_RTL.has(this.icon);

  ngOnChanges(): void {
    // TODO: remove references to 'normal' and 'outline'
    this.mode = this.outline ? 'outline' : this.mode;
    this.type = this.type === 'normal' ? 'primary' : this.type;
    this.classes = `${this.type} mode-${this.mode}`;
  }
}
