import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { OnlineStatusService } from 'xforge-common/online-status.service';

@Component({
  selector: 'app-avatar',
  templateUrl: './avatar.component.html',
  styleUrls: ['./avatar.component.scss'],
  standalone: true,
  imports: [CommonModule, MatIconModule]
})
export class AvatarComponent {
  @Input() round: boolean = false;
  @Input() size: number = 32;
  @Input() user?: UserProfile;
  @Input() borderColor?: string;
  @Input() showOnlineStatus: boolean = false;

  constructor(readonly onlineStatusService: OnlineStatusService) {}

  get mode(): 'image' | 'initials' | 'user_icon' {
    if (this.avatarUrl != null && this.avatarUrl !== '') {
      return 'image';
    }
    if (this.initials != null) {
      return 'initials';
    }
    return 'user_icon';
  }

  get avatarUrl(): string | undefined {
    return this.user?.avatarUrl;
  }

  get name(): string | undefined {
    return this.user?.displayName;
  }

  get initials(): string | undefined {
    if (this.name == null) {
      return undefined;
    }
    const characters = this.name
      .split(' ')
      .filter(s => s.length > 0)
      .map(s => s[0])
      // filter out non-latin characters
      .filter(c => c.toUpperCase() !== c.toLowerCase());
    if (characters.length === 0) {
      return undefined;
    } else if (characters.length === 1) {
      return characters[0].toUpperCase();
    } else {
      return characters[0].toUpperCase() + characters[characters.length - 1].toUpperCase();
    }
  }

  /** Generates a hue (0 to 360) based on a hash of the user display name */
  get avatarHueFromDisplayName(): number {
    if (this.name == null) {
      return 0;
    }
    let hash = 0;
    for (let i = 0; i < this.name.length; i++) {
      hash = (hash << 5) - hash + this.name.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash) % 360;
  }

  get avatarColorFromDisplayName(): string {
    return `hsl(${this.avatarHueFromDisplayName}, 60%, 50%)`;
  }
}
