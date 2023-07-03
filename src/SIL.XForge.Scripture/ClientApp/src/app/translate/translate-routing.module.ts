import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { TranslateAuthGuard } from '../shared/project-router.guard';
import { EditorComponent } from './editor/editor.component';
import { TranslateOverviewComponent } from './translate-overview/translate-overview.component';
import { DraftViewerComponent } from './draft-generation/draft-viewer/draft-viewer.component';
import { GenerateDraftComponent } from './draft-generation/draft-generation.component';

const routes: Routes = [
  {
    path: 'projects/:projectId/translate/:bookId/:chapter',
    component: EditorComponent,
    canActivate: [TranslateAuthGuard]
  },
  { path: 'projects/:projectId/translate/:bookId', component: EditorComponent, canActivate: [TranslateAuthGuard] },
  { path: 'projects/:projectId/translate', component: TranslateOverviewComponent, canActivate: [TranslateAuthGuard] },
  {
    path: 'projects/:projectId/draft-generation',
    component: GenerateDraftComponent,
    canActivate: [TranslateAuthGuard]
  },
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
