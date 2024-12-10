import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { OnlineStatusService } from '../../../xforge-common/online-status.service';

@Component({
  selector: 'app-help-videos',
  standalone: true,
  imports: [MatCardModule, MatIconModule, MatInputModule, MatFormFieldModule],
  templateUrl: './help-videos.component.html',
  styleUrl: './help-videos.component.scss'
})
export class HelpVideosComponent {
  isOnlineStatus: boolean;
  constructor(private readonly onlineStatusService: OnlineStatusService) {
    this.onlineStatusService.onlineStatus$.subscribe(isOnline => {
      this.isOnlineStatus = isOnline;
    });
  }
  get isOnline(): boolean {
    return this.isOnlineStatus;
  }
}
