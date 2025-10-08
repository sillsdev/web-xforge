import { Component } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { CollaboratorsComponent } from './collaborators/collaborators.component';

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  imports: [TranslocoModule, CollaboratorsComponent]
})
export class UsersComponent {}
