import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { CheckingAuthGuard } from '../shared/project-router.guard';
import { CheckingOverviewComponent } from './checking-overview/checking-overview.component';
import { CheckingComponent } from './checking/checking.component';

const routes: Routes = [
  { path: 'projects/:projectId/checking/:bookId', component: CheckingComponent, canActivate: [CheckingAuthGuard] },
  { path: 'projects/:projectId/checking', component: CheckingOverviewComponent, canActivate: [CheckingAuthGuard] }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class CheckingRoutingModule {}
