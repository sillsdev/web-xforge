import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { SaveStatusService } from 'xforge-common/save-status.service';

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.component.html',
  styleUrls: ['./avatar.component.scss']
})
export class AvatarComponent {
  @Input() round: boolean = false;
  @Input() size: number = 32;
  @Input() user?: UserProfile;
  @Input() showOnlineStatus: boolean = false;

  readonly statusIcon$: Observable<string | undefined> = this.docSaveNotificationService.uiSaving$.pipe(
    map(({ online, saving }) => {
      if (saving) {
        return 'cached';
      } else if (!online) {
        return 'cloud_off';
      } else {
        return undefined;
      }
    })
  );

  constructor(private readonly docSaveNotificationService: SaveStatusService) {}

  get avatarUrl(): string {
    return this.user != null ? this.user.avatarUrl : '';
  }

  get name(): string {
    return this.user != null ? this.user.displayName : '';
  }
}
