import { Component } from '@angular/core';
import { MobileNotSupportedComponent } from '../shared/mobile-not-supported/mobile-not-supported.component';
import { ServalProjectsComponent } from './serval-projects.component';

@Component({
  selector: 'app-serval-administration',
  templateUrl: './serval-administration.component.html',
  styleUrls: ['./serval-administration.component.scss'],
  imports: [ServalProjectsComponent, MobileNotSupportedComponent]
})
export class ServalAdministrationComponent {}
