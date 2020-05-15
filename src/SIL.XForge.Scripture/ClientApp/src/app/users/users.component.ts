import { Component } from '@angular/core';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.scss']
})
export class UsersComponent extends SubscriptionDisposable {
  isAppOnline: boolean = false;

  constructor(private readonly pwaService: PwaService) {
    super();
    this.isAppOnline = pwaService.isOnline;
    this.subscribe(this.pwaService.onlineStatus, isOnline => {
      this.isAppOnline = isOnline;
    });
  }
}
