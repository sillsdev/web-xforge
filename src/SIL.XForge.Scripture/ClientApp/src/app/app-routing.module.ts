import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from 'xforge-common/auth.guard';
import { SystemAdminAuthGuard } from 'xforge-common/system-admin-auth.guard';
import { SystemAdministrationComponent } from 'xforge-common/system-administration/system-administration.component';
import { ConnectProjectComponent } from './connect-project/connect-project.component';
import { EventMetricsAuthGuard } from './event-metrics/event-metrics-auth.guard';
import { EventMetricsComponent } from './event-metrics/event-metrics.component';
import { JoinComponent } from './join/join.component';
import { MyProjectsComponent } from './my-projects/my-projects.component';
import { ProjectComponent } from './project/project.component';
import { ServalAdminAuthGuard } from './serval-administration/serval-admin-auth.guard';
import { ServalAdministrationComponent } from './serval-administration/serval-administration.component';
import { ServalProjectComponent } from './serval-administration/serval-project.component';
import { SettingsComponent } from './settings/settings.component';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';
import { SettingsAuthGuard, SyncAuthGuard } from './shared/project-router.guard';
import { SyncComponent } from './sync/sync.component';
import { environment } from '../environments/environment';

const routes: Routes = [
  { path: 'callback/auth0', component: MyProjectsComponent, canActivate: [AuthGuard] },
  {
    path: 'connect-project',
    component: ConnectProjectComponent,
    canActivate: [AuthGuard],
    title: `Connect Project - ${environment.siteName}`
  },
  { path: 'login', redirectTo: 'projects', pathMatch: 'full' },
  { path: 'join/:shareKey', component: JoinComponent, title: `Join Project - ${environment.siteName}` },
  { path: 'join/:shareKey/:locale', component: JoinComponent, title: `Join Project - ${environment.siteName}` },
  {
    path: 'projects/:projectId/event-log', component: EventMetricsComponent, canActivate: [EventMetricsAuthGuard] },
  { path: 'projects/:projectId/settings',
    component: SettingsComponent,
    canActivate: [SettingsAuthGuard],
    title: `Project Settings - ${environment.siteName}`
  },
  {
    path: 'projects/:projectId/sync',
    component: SyncComponent,
    canActivate: [SyncAuthGuard],
    title: `Synchronize Project - ${environment.siteName}`
  },
  { path: 'projects/:projectId', component: ProjectComponent, canActivate: [AuthGuard] },
  { path: 'projects', component: MyProjectsComponent, canActivate: [AuthGuard] },
  { path: 'serval-administration/:projectId', component: ServalProjectComponent, canActivate: [ServalAdminAuthGuard] },
  {
    path: 'serval-administration',
    component: ServalAdministrationComponent,
    canActivate: [ServalAdminAuthGuard],
    title: `Serval Administration - ${environment.siteName}`
  },
  {
    path: 'system-administration',
    component: SystemAdministrationComponent,
    canActivate: [SystemAdminAuthGuard],
    title: `System Administration - ${environment.siteName}`
  },
  { path: '**', component: PageNotFoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
