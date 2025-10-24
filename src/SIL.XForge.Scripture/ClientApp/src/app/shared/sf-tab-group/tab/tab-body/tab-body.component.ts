import { Component, HostBinding, Input } from '@angular/core';

@Component({
  selector: 'app-tab-body',
  templateUrl: './tab-body.component.html',
  styleUrls: ['./tab-body.component.scss']
})
export class TabBodyComponent {
  @HostBinding('class.active')
  @Input()
  active = false;
}
