import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { CheckingAuthGuard } from '../shared/project-router.guard';
import { CheckingOverviewComponent } from './checking-overview/checking-overview.component';
import { CheckingComponent } from './checking/checking.component';
import { environment } from '../../environments/environment';

const routes: Routes = [
  {
    path: 'projects/:projectId/checking/:bookId/:chapter',
    component: CheckingComponent,
    canActivate: [CheckingAuthGuard],
    title: `Community Checking Questions & Answers - ${environment.siteName}`
  },
  {
    path: 'projects/:projectId/checking/:bookId',
    component: CheckingComponent,
    canActivate: [CheckingAuthGuard],
    title: `Community Checking Questions & Answers - ${environment.siteName}`
  },
  {
    path: 'projects/:projectId/checking',
    component: CheckingOverviewComponent,
    canActivate: [CheckingAuthGuard],
    title: `Community Checking Management - ${environment.siteName}`
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CheckingRoutingModule {}
