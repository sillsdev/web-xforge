import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Meta } from '@storybook/angular';
import { anything, instance, mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { UserService } from 'xforge-common/user.service';
import { MatDialogLaunchComponent, matDialogStory } from '../../../../../.storybook/util/mat-dialog-launch';
import { ParatextService } from '../../../core/paratext.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { DraftApplyDialogComponent } from './draft-apply-dialog.component';

@Component({ template: '' })
class EmptyComponent {}

const mockedParatextService = mock(ParatextService);
const mockedI18nService = mock(I18nService);
const mockedDialogRef = mock(MatDialogRef);
const mockedProjectService = mock(SFProjectService);
const mockedTextDocService = mock(TextDocService);
const mockedUserService = mock(UserService);
const mockActivatedRoute = mock(ActivatedRoute);

when(mockedParatextService.getProjects()).thenResolve([
  {
    paratextId: 'pt01',
    name: 'Project 01',
    shortName: 'P01',
    isConnectable: true,
    isConnected: true,
    languageTag: 'fr'
  }
]);
when(mockedI18nService.translateTextAroundTemplateTags(anything())).thenReturn({
  before: 'Looking for a project that is not listed? Connect it on ',
  templateTagText: 'the projects page',
  after: ' first'
});

const meta: Meta = {
  title: 'Misc/Dialogs/Draft Apply Dialog',
  component: MatDialogLaunchComponent
};
export default meta;

export const DraftApplyDialog = matDialogStory(DraftApplyDialogComponent, {
  standaloneComponent: true,
  imports: [RouterModule.forChild([{ path: 'projects', component: EmptyComponent }])],
  providers: [
    { provide: ActivatedRoute, useValue: instance(mockActivatedRoute) },
    { provide: ParatextService, useValue: instance(mockedParatextService) },
    { provide: I18nService, useValue: instance(mockedI18nService) },
    { provide: MatDialogRef, useValue: instance(mockedDialogRef) },
    { provide: SFProjectService, useValue: instance(mockedProjectService) },
    { provide: TextDocService, useValue: instance(mockedTextDocService) },
    { provide: UserService, useValue: instance(mockedUserService) }
  ]
});
DraftApplyDialog.args = { data: { bookNum: 1 } };
