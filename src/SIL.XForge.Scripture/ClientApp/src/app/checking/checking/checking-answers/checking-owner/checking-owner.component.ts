import { Component, Input, OnInit } from '@angular/core';
import { UserProfile } from 'realtime-server/lib/common/models/user';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { UserService } from 'xforge-common/user.service';

@Component({
  selector: 'app-checking-owner',
  templateUrl: './checking-owner.component.html',
  styleUrls: ['./checking-owner.component.scss']
})
export class CheckingOwnerComponent implements OnInit {
  @Input() ownerRef: string;
  @Input() includeAvatar: boolean = false;
  @Input() dateTime: string = '';
  @Input() layoutStacked: boolean = false;
  private ownerDoc: UserProfileDoc;

  constructor(private userService: UserService) {}

  get date(): Date {
    return new Date(this.dateTime);
  }

  get name(): string {
    if (this.ownerDoc == null) {
      return '';
    }
    return this.userService.currentUserId === this.ownerDoc.id ? 'Me' : this.ownerDoc.data.displayName;
  }

  get owner(): UserProfile {
    return this.ownerDoc == null ? undefined : this.ownerDoc.data;
  }

  ngOnInit(): void {
    this.userService.getProfile(this.ownerRef).then(u => (this.ownerDoc = u));
  }
}
