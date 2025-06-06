import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DraftNavigationAuthGuard, NmtDraftAuthGuard, TranslateAuthGuard } from '../shared/project-router.guard';
import { DraftGenerationComponent } from './draft-generation/draft-generation.component';
import { DraftSourcesComponent } from './draft-generation/draft-sources/draft-sources.component';
import { DraftUsfmFormatComponent } from './draft-generation/draft-usfm-format/draft-usfm-format.component';
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
  },
  {
    path: 'projects/:projectId/draft-generation/sources',
    component: DraftSourcesComponent,
    canActivate: [NmtDraftAuthGuard],
    canDeactivate: [DraftNavigationAuthGuard]
  },
  {
    path: 'projects/:projectId/draft-generation/format',
    component: DraftUsfmFormatComponent,
    canActivate: [NmtDraftAuthGuard],
    canDeactivate: [DraftNavigationAuthGuard]
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TranslateRoutingModule {}
