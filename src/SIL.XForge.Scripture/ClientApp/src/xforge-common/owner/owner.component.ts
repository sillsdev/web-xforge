import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Input, OnInit } from '@angular/core';
import { TranslocoService } from '@ngneat/transloco';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { AvatarComponent } from '../avatar/avatar.component';
import { I18nService } from '../i18n.service';
import { UserProfileDoc } from '../models/user-profile-doc';
import { UserService } from '../user.service';

@Component({
  selector: 'app-owner',
  templateUrl: './owner.component.html',
  styleUrls: ['./owner.component.scss'],
  standalone: true,
  imports: [AvatarComponent, CommonModule]
})
export class OwnerComponent implements OnInit {
  @Input() ownerRef?: string;
  @Input() includeAvatar: boolean = false;
  @Input() dateTime: string = '';
  @Input() layoutStacked: boolean = false;
  private ownerDoc?: UserProfileDoc;

  constructor(
    private readonly userService: UserService,
    readonly i18n: I18nService,
    private readonly translocoService: TranslocoService,
    private readonly destroyRef: DestroyRef
  ) {}

  get date(): Date {
    return new Date(this.dateTime);
  }

  get name(): string {
    if (this.ownerDoc == null || this.ownerDoc.data == null) {
      return this.translocoService.translate('checking.unknown_author');
    }
    return this.userService.currentUserId === this.ownerDoc.id
      ? this.translocoService.translate('checking.me')
      : this.ownerDoc.data.displayName;
  }

  get owner(): UserProfile | undefined {
    return this.ownerDoc == null ? undefined : this.ownerDoc.data;
  }

  async ngOnInit(): Promise<void> {
    if (this.ownerRef != null) {
      this.ownerDoc = await this.userService.subscribeProfile(
        this.ownerRef,
        new DocSubscription('OwnerComponent', this.destroyRef)
      );
    }
  }
}
