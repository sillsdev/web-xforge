import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UsersAuthGuard } from '../shared/project-router.guard';
import { UsersComponent } from './users.component';
import { environment } from '../../environments/environment';

const routes: Routes = [
  {
    path: 'projects/:projectId/users',
    component: UsersComponent,
    canActivate: [UsersAuthGuard],
    title: `User Management - ${environment.siteName}`
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UsersRoutingModule {}
