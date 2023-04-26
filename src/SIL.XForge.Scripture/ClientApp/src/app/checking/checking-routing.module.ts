import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { CheckingAuthGuard } from '../shared/project-router.guard';
import { CheckingOverviewComponent } from './checking-overview/checking-overview.component';
import { CheckingComponent } from './checking/checking.component';
import { ProgressComponent } from './progress/progress.component';

const routes: Routes = [
  {
    path: 'projects/:projectId/checking/questions',
    component: CheckingOverviewComponent,
    canActivate: [CheckingAuthGuard]
  },
  { path: 'projects/:projectId/checking', component: ProgressComponent, canActivate: [CheckingAuthGuard] },
  { path: 'projects/:projectId/checking/:bookId', component: CheckingComponent, canActivate: [CheckingAuthGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CheckingRoutingModule {}
