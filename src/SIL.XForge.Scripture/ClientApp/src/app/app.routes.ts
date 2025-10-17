import { Routes } from '@angular/router';
import { AuthGuard } from 'xforge-common/auth.guard';
import { SystemAdminAuthGuard } from 'xforge-common/system-admin-auth.guard';
import { SystemAdministrationComponent } from 'xforge-common/system-administration/system-administration.component';
import { CheckingOverviewComponent } from './checking/checking-overview/checking-overview.component';
import { CheckingComponent } from './checking/checking/checking.component';
import { ConnectProjectComponent } from './connect-project/connect-project.component';
import { EventMetricsAuthGuard } from './event-metrics/event-metrics-auth.guard';
import { EventMetricsComponent } from './event-metrics/event-metrics.component';
import { JoinComponent } from './join/join.component';
import { MyProjectsComponent } from './my-projects/my-projects.component';
import { PermissionsViewerComponent } from './permissions-viewer/permissions-viewer.component';
import { ProjectComponent } from './project/project.component';
import { ServalAdminAuthGuard } from './serval-administration/serval-admin-auth.guard';
import { ServalAdministrationComponent } from './serval-administration/serval-administration.component';
import { ServalProjectComponent } from './serval-administration/serval-project.component';
import { SettingsComponent } from './settings/settings.component';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';
import { CheckingAuthGuard, SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from './shared/project-router.guard';
import { SyncComponent } from './sync/sync.component';
import { UsersComponent } from './users/users.component';

export const APP_ROUTES: Routes = [
  { path: 'callback/auth0', component: MyProjectsComponent, canActivate: [AuthGuard] },
  { path: 'connect-project', component: ConnectProjectComponent, canActivate: [AuthGuard] },
  { path: 'login', redirectTo: 'projects', pathMatch: 'full' },
  { path: 'join/:shareKey', component: JoinComponent },
  { path: 'join/:shareKey/:locale', component: JoinComponent },
  {
    path: 'projects/:projectId/checking/:bookId/:chapter',
    component: CheckingComponent,
    canActivate: [CheckingAuthGuard]
  },
  { path: 'projects/:projectId/checking/:bookId', component: CheckingComponent, canActivate: [CheckingAuthGuard] },
  { path: 'projects/:projectId/checking', component: CheckingOverviewComponent, canActivate: [CheckingAuthGuard] },
  { path: 'projects/:projectId/event-log', component: EventMetricsComponent, canActivate: [EventMetricsAuthGuard] },
  { path: 'projects/:projectId/settings', component: SettingsComponent, canActivate: [SettingsAuthGuard] },
  { path: 'projects/:projectId/sync', component: SyncComponent, canActivate: [SyncAuthGuard] },
  { path: 'projects/:projectId/users', component: UsersComponent, canActivate: [UsersAuthGuard] },
  { path: 'projects/:projectId', component: ProjectComponent, canActivate: [AuthGuard] },
  { path: 'projects', component: MyProjectsComponent, canActivate: [AuthGuard] },
  { path: 'system-administration/permissions-viewer', component: PermissionsViewerComponent },
  { path: 'serval-administration/:projectId', component: ServalProjectComponent, canActivate: [ServalAdminAuthGuard] },
  { path: 'serval-administration', component: ServalAdministrationComponent, canActivate: [ServalAdminAuthGuard] },
  { path: 'system-administration', component: SystemAdministrationComponent, canActivate: [SystemAdminAuthGuard] },
  { path: '**', component: PageNotFoundComponent }
];
