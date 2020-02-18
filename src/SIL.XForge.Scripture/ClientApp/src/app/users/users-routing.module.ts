import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SFAdminAuthGuard } from '../shared/project-router.guard';
import { UsersComponent } from './users.component';

const routes: Routes = [
  { path: 'projects/:projectId/users', component: UsersComponent, canActivate: [SFAdminAuthGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UsersRoutingModule {}
