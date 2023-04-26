import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TranslateAuthGuard } from '../shared/project-router.guard';
import { ActivityComponent } from './activity/activity.component';
import { EditorComponent } from './editor/editor.component';
import { GenerateDraftComponent } from './generate-draft/generate-draft.component';
import { QualityChecksComponent } from './quality-checks/quality-checks.component';
import { TranslateOverviewComponent } from './translate-overview/translate-overview.component';

const routes: Routes = [
  { path: 'projects/:projectId/translate/:bookId', component: EditorComponent, canActivate: [TranslateAuthGuard] },
  { path: 'projects/:projectId/translate', component: TranslateOverviewComponent, canActivate: [TranslateAuthGuard] },
  { path: 'projects/:projectId/activity', component: ActivityComponent, canActivate: [TranslateAuthGuard] },
  { path: 'projects/:projectId/generate-draft', component: GenerateDraftComponent, canActivate: [TranslateAuthGuard] },
  { path: 'projects/:projectId/quality-checks', component: QualityChecksComponent, canActivate: [TranslateAuthGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TranslateRoutingModule {}
