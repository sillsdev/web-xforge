import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { UsersAuthGuard } from '../shared/project-router.guard';
import { UsersComponent } from './users.component';

const routes: Routes = [
  { path: 'projects/:projectId/users', component: UsersComponent, canActivate: [UsersAuthGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class UsersRoutingModule {}
