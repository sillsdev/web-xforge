import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';

@Component({
  selector: 'app-offline',
  templateUrl: './offline.component.html',
  styleUrls: ['./offline.component.scss']
})
export class OfflineComponent extends SubscriptionDisposable {
  constructor(private readonly router: Router, private readonly pwaService: PwaService) {
    super();
    this.subscribe(pwaService.onlineStatus, status => {
      if (status) {
        this.router.navigateByUrl('/projects');
      }
    });
  }
}
