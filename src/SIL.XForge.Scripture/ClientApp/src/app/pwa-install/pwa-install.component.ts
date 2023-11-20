import { Component } from '@angular/core';
import { PwaService } from 'xforge-common/pwa.service';

@Component({
  selector: 'app-pwa-install',
  templateUrl: './pwa-install.component.html',
  styleUrls: ['./pwa-install.component.scss']
})
export class PwaInstallComponent {
  constructor(private readonly pwaService: PwaService) {}

  get canInstall(): Promise<true> {
    return this.pwaService.canInstall;
  }
}
