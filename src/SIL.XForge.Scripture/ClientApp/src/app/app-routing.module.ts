import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from 'xforge-common/auth.guard';
import { SupportedBrowsersComponent } from 'xforge-common/supported-browsers/supported-browsers.component';
import { SystemAdminAuthGuard } from 'xforge-common/system-admin-auth.guard';
import { SystemAdministrationComponent } from 'xforge-common/system-administration/system-administration.component';
import { ConnectProjectComponent } from './connect-project/connect-project.component';
import { ProjectComponent } from './project/project.component';
import { SettingsComponent } from './settings/settings.component';
import { SFAdminAuthGuard } from './shared/project-router.guard';
import { StartComponent } from './start/start.component';
import { SyncComponent } from './sync/sync.component';

const routes: Routes = [
  { path: 'connect-project', component: ConnectProjectComponent, canActivate: [AuthGuard] },
  { path: 'projects/:projectId/settings', component: SettingsComponent, canActivate: [SFAdminAuthGuard] },
  { path: 'projects/:projectId/sync', component: SyncComponent, canActivate: [SFAdminAuthGuard] },
  { path: 'projects/:projectId', component: ProjectComponent, canActivate: [AuthGuard] },
  { path: 'projects', component: StartComponent, canActivate: [AuthGuard] },
  { path: 'supported-browsers', component: SupportedBrowsersComponent, canActivate: [AuthGuard] },
  { path: 'system-administration', component: SystemAdministrationComponent, canActivate: [SystemAdminAuthGuard] }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
