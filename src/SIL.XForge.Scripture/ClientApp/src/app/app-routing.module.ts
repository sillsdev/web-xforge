import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from 'xforge-common/auth.guard';
import { SystemAdminAuthGuard } from 'xforge-common/system-admin-auth.guard';
import { SystemAdministrationComponent } from 'xforge-common/system-administration/system-administration.component';
import { ConnectProjectComponent } from './connect-project/connect-project.component';
import { JoinComponent } from './join/join.component';
import { ProjectComponent } from './project/project.component';
import { ServalAdminAuthGuard } from './serval-administration/serval-admin-auth.guard';
import { ServalAdministrationComponent } from './serval-administration/serval-administration.component';
import { ServalProjectComponent } from './serval-administration/serval-project.component';
import { SettingsComponent } from './settings/settings.component';
import { PageNotFoundComponent } from './shared/page-not-found/page-not-found.component';
import { SettingsAuthGuard, SyncAuthGuard } from './shared/project-router.guard';
import { MyProjectsComponent } from './my-projects/my-projects.component';
import { SyncComponent } from './sync/sync.component';
import { HelpVideosComponent } from './help/help-videos/help-videos.component';

const routes: Routes = [
  { path: 'callback/auth0', component: MyProjectsComponent, canActivate: [AuthGuard] },
  { path: 'connect-project', component: ConnectProjectComponent, canActivate: [AuthGuard] },
  { path: 'help-videos', component: HelpVideosComponent },
  { path: 'login', redirectTo: 'projects', pathMatch: 'full' },
  { path: 'join/:shareKey', component: JoinComponent },
  { path: 'join/:shareKey/:locale', component: JoinComponent },
  { path: 'projects/:projectId/settings', component: SettingsComponent, canActivate: [SettingsAuthGuard] },
  { path: 'projects/:projectId/sync', component: SyncComponent, canActivate: [SyncAuthGuard] },
  { path: 'projects/:projectId', component: ProjectComponent, canActivate: [AuthGuard] },
  { path: 'projects', component: MyProjectsComponent, canActivate: [AuthGuard] },
  { path: 'serval-administration/:projectId', component: ServalProjectComponent, canActivate: [ServalAdminAuthGuard] },
  { path: 'serval-administration', component: ServalAdministrationComponent, canActivate: [ServalAdminAuthGuard] },
  { path: 'system-administration', component: SystemAdministrationComponent, canActivate: [SystemAdminAuthGuard] },
  { path: '**', component: PageNotFoundComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
