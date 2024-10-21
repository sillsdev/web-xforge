import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { Meta } from '@storybook/angular';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { BehaviorSubject } from 'rxjs';
import { anything, instance, mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { SFUserProjectsService } from 'xforge-common/user-projects.service';
import { UserService } from 'xforge-common/user.service';
import { MatDialogLaunchComponent, matDialogStory } from '../../../../../.storybook/util/mat-dialog-launch';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { DraftApplyDialogComponent } from './draft-apply-dialog.component';

@Component({ template: '' })
class EmptyComponent {}

const mockedUserProjectService = mock(SFUserProjectsService);
const mockedI18nService = mock(I18nService);
const mockedDialogRef = mock(MatDialogRef);
const mockedProjectService = mock(SFProjectService);
const mockedTextDocService = mock(TextDocService);
const mockedUserService = mock(UserService);
const mockActivatedRoute = mock(ActivatedRoute);
const projectDoc = {
  id: 'project01',
  data: createTestProjectProfile()
} as SFProjectProfileDoc;
const projectDocs$: BehaviorSubject<SFProjectProfileDoc[] | undefined> = new BehaviorSubject<
  SFProjectProfileDoc[] | undefined
>([projectDoc]);

when(mockedUserProjectService.projectDocs$).thenReturn(projectDocs$);
when(mockedI18nService.translateAndInsertTags(anything())).thenReturn(
  'Looking for a project that is not listed? Connect it on <u>the projects page</u> first.'
);

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
    { provide: SFUserProjectsService, useValue: instance(mockedUserProjectService) },
    { provide: I18nService, useValue: instance(mockedI18nService) },
    { provide: MatDialogRef, useValue: instance(mockedDialogRef) },
    { provide: SFProjectService, useValue: instance(mockedProjectService) },
    { provide: TextDocService, useValue: instance(mockedTextDocService) },
    { provide: UserService, useValue: instance(mockedUserService) }
  ]
});
DraftApplyDialog.args = { data: { bookNum: 1 } };
