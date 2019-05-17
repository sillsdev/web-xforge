import { Component, Input, OnInit } from '@angular/core';
import { User } from 'xforge-common/models/user';
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
  owner: User = new User();

  constructor(private userService: UserService) {}

  get date(): Date {
    return new Date(this.dateTime);
  }

  get name(): string {
    return this.userService.currentUserId === this.owner.id ? 'Me' : this.owner.name;
  }

  ngOnInit() {
    this.userService.onlineGet(this.ownerRef).subscribe(userData => {
      this.owner = userData.data;
    });
  }
}
