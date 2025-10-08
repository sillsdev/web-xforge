import { Component } from '@angular/core';
import { MobileNotSupportedComponent } from '../../app/shared/mobile-not-supported/mobile-not-supported.component';
import { MatTabGroup, MatTab } from '@angular/material/tabs';
import { SaUsersComponent } from './sa-users.component';
import { SaProjectsComponent } from './sa-projects.component';

@Component({
  selector: 'app-system-administration',
  templateUrl: './system-administration.component.html',
  styleUrls: ['./system-administration.component.scss'],
  imports: [MobileNotSupportedComponent, MatTabGroup, MatTab, SaUsersComponent, SaProjectsComponent]
})
export class SystemAdministrationComponent {}
