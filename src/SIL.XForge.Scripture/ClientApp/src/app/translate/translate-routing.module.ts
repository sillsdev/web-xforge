import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TranslateAuthGuard } from '../shared/project-router.guard';
import { EditorComponent } from './editor/editor.component';
import { TranslateOverviewComponent } from './translate-overview/translate-overview.component';
import { DraftViewerComponent } from './generate-draft/draft-viewer/draft-viewer.component';
import { GenerateDraftComponent } from './generate-draft/generate-draft.component';

const routes: Routes = [
  {
    path: 'projects/:projectId/translate/:bookId/:chapter',
    component: EditorComponent,
    canActivate: [TranslateAuthGuard]
  },
  { path: 'projects/:projectId/translate/:bookId', component: EditorComponent, canActivate: [TranslateAuthGuard] },
  { path: 'projects/:projectId/translate', component: TranslateOverviewComponent, canActivate: [TranslateAuthGuard] },
  { path: 'projects/:projectId/generate-draft', component: GenerateDraftComponent, canActivate: [TranslateAuthGuard] },
  {
    path: 'projects/:projectId/draft-preview/:bookId/:chapter',
    component: DraftViewerComponent,
    canActivate: [TranslateAuthGuard]
  },
  { path: 'projects/:projectId/draft-preview', component: DraftViewerComponent, canActivate: [TranslateAuthGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TranslateRoutingModule {}
