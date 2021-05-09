import { Component, Input } from '@angular/core';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';

@Component({
  selector: 'app-avatar',
  template: '<img [width]="size" [height]="size" />'
})
export class AvatarTestingComponent {
  @Input() round: boolean = false;
  @Input() size: number = 32;
  @Input() user?: UserProfile;
  @Input() showOnlineStatus: boolean = false;
}
