import { MdcDialog, MdcDialogModule, MdcDialogRef, OverlayContainer } from '@angular-mdc/web';
import { CUSTOM_ELEMENTS_SCHEMA, DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import { Snapshot } from 'sharedb/lib/client';
import { anything, instance, mock, resetCalls, verify, when } from 'ts-mockito';

import { AuthService } from 'xforge-common/auth.service';
import { RealtimeDoc } from 'xforge-common/realtime-doc';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { Question } from '../../core/models/question';
import { QuestionData } from '../../core/models/question-data';
import { Text } from '../../core/models/text';
import { QuestionService } from '../../core/question.service';
import { SFProjectService } from '../../core/sfproject.service';
import { SFAdminAuthGuard } from '../../shared/sfadmin-auth.guard';
import { QuestionDialogComponent } from '../question-dialog/question-dialog.component';
import { CheckingOverviewComponent } from './checking-overview.component';

describe('CheckingOverviewComponent', () => {
  describe('Add Question', () => {
    it('should only display "Add question" button for admin', fakeAsync(() => {
      const env = new TestEnvironment();
      env.makeUserAProjectAdmin(false);
      expect(env.addQuestionButton).toBeNull();
      env.makeUserAProjectAdmin();
      expect(env.addQuestionButton).toBeDefined();
    }));

    it('should open dialog when "Add question" button is clicked', fakeAsync(() => {
      const env = new TestEnvironment();
      when(env.mockedMdcDialogRefForQDC.afterClosed()).thenReturn(of('close'));
      env.fixture.detectChanges();
      env.clickElement(env.addQuestionButton);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      expect().nothing();
    }));

    it('should not add a question if cancelled', fakeAsync(() => {
      const env = new TestEnvironment();
      when(env.mockedMdcDialogRefForQDC.afterClosed()).thenReturn(of('close'));
      env.fixture.detectChanges();
      flush();
      verify(env.mockedQuestionService.connect(anything())).once();

      resetCalls(env.mockedQuestionService);
      env.clickElement(env.addQuestionButton);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      verify(env.mockedQuestionService.connect(anything())).never();
      expect().nothing();
    }));

    it('should add a question if requested', fakeAsync(() => {
      const env = new TestEnvironment();
      when(env.mockedMdcDialogRefForQDC.afterClosed()).thenReturn(of(''));
      env.fixture.detectChanges();
      flush();
      verify(env.mockedQuestionService.connect(anything())).once();

      resetCalls(env.mockedQuestionService);
      env.clickElement(env.addQuestionButton);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      verify(env.mockedQuestionService.connect(anything())).once();
      expect().nothing();
    }));
  });
});

@NgModule({
  imports: [FormsModule, MdcDialogModule, ReactiveFormsModule, NoopAnimationsModule, UICommonModule],
  exports: [QuestionDialogComponent],
  declarations: [QuestionDialogComponent],
  entryComponents: [QuestionDialogComponent]
})
class DialogTestModule {}

class TestEnvironment {
  component: CheckingOverviewComponent;
  fixture: ComponentFixture<CheckingOverviewComponent>;

  mockedActivatedRoute: ActivatedRoute = mock(ActivatedRoute);
  mockedMdcDialog: MdcDialog = mock(MdcDialog);
  mockedMdcDialogRefForQDC: MdcDialogRef<QuestionDialogComponent> = mock(MdcDialogRef);
  mockedSFAdminAuthGuard: SFAdminAuthGuard = mock(SFAdminAuthGuard);
  mockedProjectService: SFProjectService = mock(SFProjectService);
  mockedQuestionService: QuestionService = mock(QuestionService);
  mockedUserService: UserService = mock(UserService);
  mockedAuthService: AuthService = mock(AuthService);
  mockedRealtimeOfflineStore: RealtimeOfflineStore = mock(RealtimeOfflineStore);
  overlayContainer: OverlayContainer;

  constructor() {
    when(this.mockedActivatedRoute.params).thenReturn(of({}));
    when(this.mockedMdcDialog.open(anything(), anything())).thenReturn(instance(this.mockedMdcDialogRefForQDC));
    when(this.mockedSFAdminAuthGuard.allowTransition(anything())).thenReturn(of(true));
    when(this.mockedProjectService.getTexts(anything())).thenReturn(of([{ id: 'text01' } as Text]));
    when(this.mockedQuestionService.connect(anything())).thenResolve(this.createQuestionData());

    TestBed.configureTestingModule({
      imports: [DialogTestModule],
      declarations: [CheckingOverviewComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: MdcDialog, useFactory: () => instance(this.mockedMdcDialog) },
        { provide: SFAdminAuthGuard, useFactory: () => instance(this.mockedSFAdminAuthGuard) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedProjectService) },
        { provide: QuestionService, useFactory: () => instance(this.mockedQuestionService) },
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: AuthService, useFactory: () => instance(this.mockedAuthService) }
      ]
    });
    this.fixture = TestBed.createComponent(CheckingOverviewComponent);
    this.component = this.fixture.componentInstance;
    this.overlayContainer = TestBed.get(OverlayContainer);
  }

  get addQuestionButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#add-question-button'));
  }

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = (element as DebugElement).nativeElement as HTMLElement;
    }
    element.click();
    this.fixture.detectChanges();
    flush();
  }

  makeUserAProjectAdmin(isProjectAdmin: boolean = true) {
    this.component.isProjectAdmin$ = of(isProjectAdmin);
  }

  private createQuestionData(): QuestionData {
    const doc = new MockRealtimeDoc('text01', []);
    return new QuestionData(doc, instance(this.mockedRealtimeOfflineStore));
  }
}

class MockRealtimeDoc implements RealtimeDoc {
  readonly version: number = 1;
  readonly type: string = 'ot-json0';
  readonly pendingOps: any[] = [];

  constructor(public readonly id: string, public readonly data: Question[]) {}

  idle(): Observable<void> {
    return of();
  }

  fetch(): Promise<void> {
    return Promise.resolve();
  }

  ingestSnapshot(_snapshot: Snapshot): Promise<void> {
    return Promise.resolve();
  }

  subscribe(): Promise<void> {
    return Promise.resolve();
  }

  submitOp(_data: any, _source?: any): Promise<void> {
    return Promise.resolve();
  }

  remoteChanges(): Observable<any> {
    return of();
  }

  destroy(): Promise<void> {
    return Promise.resolve();
  }
}
