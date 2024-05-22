import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { NmtDraftAuthGuard, TranslateAuthGuard } from '../shared/project-router.guard';
import { DraftGenerationComponent } from './draft-generation/draft-generation.component';
import { EditorComponent } from './editor/editor.component';
import { TranslateOverviewComponent } from './translate-overview/translate-overview.component';

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
    component: DraftGenerationComponent,
    canActivate: [NmtDraftAuthGuard]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TranslateRoutingModule {}
