import { Component } from '@angular/core';
import { ServalProjectsComponent } from './serval-projects.component';

@Component({
  selector: 'app-serval-administration',
  templateUrl: './serval-administration.component.html',
  styleUrls: ['./serval-administration.component.scss'],
  standalone: true,
  imports: [ServalProjectsComponent]
})
export class ServalAdministrationComponent {}
