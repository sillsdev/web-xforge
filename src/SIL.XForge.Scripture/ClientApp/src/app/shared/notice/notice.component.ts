import { Component, HostBinding, Input, OnChanges } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ICONS_TO_MIRROR_RTL } from '../utils';
import { NoticeMode, NoticeType } from './notice.types';

@Component({
    selector: 'app-notice',
    templateUrl: './notice.component.html',
    styleUrls: ['./notice.component.scss'],
    imports: [MatIconModule]
})
export class NoticeComponent implements OnChanges {
  @Input() type: NoticeType = 'primary';
  @Input() mode: NoticeMode = 'fill-light';
  @Input() icon?: string;

  @HostBinding('class') classes!: string;

  readonly mirrorRtl = ICONS_TO_MIRROR_RTL.has(this.icon);

  ngOnChanges(): void {
    this.classes = `${this.type} mode-${this.mode}`;
  }
}
