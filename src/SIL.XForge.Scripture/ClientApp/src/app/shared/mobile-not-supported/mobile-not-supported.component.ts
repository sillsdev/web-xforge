import { Component } from '@angular/core';
import { NoticeComponent } from '../notice/notice.component';

@Component({
  selector: 'app-mobile-not-supported',
  standalone: true,
  imports: [NoticeComponent],
  templateUrl: './mobile-not-supported.component.html'
})
export class MobileNotSupportedComponent {}
