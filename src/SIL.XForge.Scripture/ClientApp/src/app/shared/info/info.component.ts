import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-info',
  templateUrl: './info.component.html',
  styleUrls: ['./info.component.scss']
})
export class InfoComponent {
  @Input() icon?: string = 'help';
  @Input() type: 'normal' | 'warning' | 'error' = 'normal';
  @Input() text: string = '';

  constructor() {}
}
