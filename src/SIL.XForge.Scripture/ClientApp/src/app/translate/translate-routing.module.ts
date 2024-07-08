import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { NmtDraftAuthGuard, TranslateAuthGuard } from '../shared/project-router.guard';
import { DraftGenerationComponent } from './draft-generation/draft-generation.component';
import { DraftSourcesComponent } from './draft-generation/draft-sources/draft-sources.component';
import { EditorComponent } from './editor/editor.component';
import { TranslateOverviewComponent } from './translate-overview/translate-overview.component';
import { environment } from '../../environments/environment';

const routes: Routes = [
  {
    path: 'projects/:projectId/translate/:bookId/:chapter',
    component: EditorComponent,
    canActivate: [TranslateAuthGuard],
    title: `Editor & Review - ${environment.siteName}`
  },
  {
    path: 'projects/:projectId/translate/:bookId',
    component: EditorComponent,
    canActivate: [TranslateAuthGuard],
    title: `Editor & Review - ${environment.siteName}`
  },
  {
    path: 'projects/:projectId/translate',
    component: TranslateOverviewComponent,
    canActivate: [TranslateAuthGuard],
    title: `Translation Overview - ${environment.siteName}`
  },
  {
    path: 'projects/:projectId/draft-generation',
    component: DraftGenerationComponent,
    canActivate: [NmtDraftAuthGuard],
    title: `Draft Generation - ${environment.siteName}`
  },
  {
    path: 'projects/:projectId/draft-generation/sources',
    component: DraftSourcesComponent,
    canActivate: [NmtDraftAuthGuard],
    title: `Configure Draft Sources - ${environment.siteName}`
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class TranslateRoutingModule {}
