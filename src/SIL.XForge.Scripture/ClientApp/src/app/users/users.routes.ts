import { Routes } from '@angular/router';
import { UsersAuthGuard } from '../shared/project-router.guard';
import { UsersComponent } from './users.component';

export const USERS_ROUTES: Routes = [
  { path: 'projects/:projectId/users', component: UsersComponent, canActivate: [UsersAuthGuard] }
];
