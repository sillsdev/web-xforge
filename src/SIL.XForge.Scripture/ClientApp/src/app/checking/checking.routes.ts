import { Routes } from '@angular/router';
import { CheckingAuthGuard } from '../shared/project-router.guard';
import { CheckingOverviewComponent } from './checking-overview/checking-overview.component';
import { CheckingComponent } from './checking/checking.component';

export const CHECKING_ROUTES: Routes = [
  {
    path: 'projects/:projectId/checking/:bookId/:chapter',
    component: CheckingComponent,
    canActivate: [CheckingAuthGuard]
  },
  { path: 'projects/:projectId/checking/:bookId', component: CheckingComponent, canActivate: [CheckingAuthGuard] },
  { path: 'projects/:projectId/checking', component: CheckingOverviewComponent, canActivate: [CheckingAuthGuard] }
];
