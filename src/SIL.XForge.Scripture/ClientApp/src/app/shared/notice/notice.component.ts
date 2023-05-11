import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-notice',
  templateUrl: './notice.component.html',
  styleUrls: ['./notice.component.scss']
})
export class NoticeComponent {
  @Input() icon?: string;
  @Input() type: 'normal' | 'warning' | 'error' = 'normal';
  @Input() outline: boolean = false;
  @Input() helpLink?: string;

  constructor() {}
}
