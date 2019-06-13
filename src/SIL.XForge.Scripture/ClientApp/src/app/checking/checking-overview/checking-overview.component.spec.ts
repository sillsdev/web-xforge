import { MdcDialog, MdcDialogModule, MdcDialogRef, OverlayContainer } from '@angular-mdc/web';
import { CUSTOM_ELEMENTS_SCHEMA, DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import * as OTJson0 from 'ot-json0';
import { of } from 'rxjs';
import { anything, deepEqual, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { NoticeService } from 'xforge-common/notice.service';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { Question } from '../../core/models/question';
import { QuestionsDoc } from '../../core/models/questions-doc';
import { SFProjectData } from '../../core/models/sfproject-data';
import { SFProjectDataDoc } from '../../core/models/sfproject-data-doc';
import { TextDocId } from '../../core/models/text-doc-id';
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

    it('should disable "Add question" button when loading', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      expect(env.addQuestionButton.nativeElement.disabled).toBe(true);
    }));

    it('should open dialog when "Add question" button is clicked', fakeAsync(() => {
      const env = new TestEnvironment();
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(of('close'));
      env.fixture.detectChanges();
      flush();
      env.fixture.detectChanges();
      expect(env.addQuestionButton.nativeElement.disabled).toBe(false);
      env.clickElement(env.addQuestionButton);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
    }));

    it('should not add a question if cancelled', fakeAsync(() => {
      const env = new TestEnvironment();
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(of('close'));
      env.fixture.detectChanges();
      flush();
      env.fixture.detectChanges();
      expect(env.addQuestionButton.nativeElement.disabled).toBe(false);
      verify(env.mockedProjectService.getQuestionsDoc(anything())).twice();

      resetCalls(env.mockedProjectService);
      env.clickElement(env.addQuestionButton);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      verify(env.mockedProjectService.getQuestionsDoc(anything())).never();
    }));

    it('should add a question if requested', fakeAsync(() => {
      const env = new TestEnvironment();
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(
        of({
          scriptureStart: 'MAT 3:3',
          scriptureEnd: '',
          text: ''
        })
      );
      env.fixture.detectChanges();
      flush();
      env.fixture.detectChanges();
      expect(env.addQuestionButton.nativeElement.disabled).toBe(false);
      verify(env.mockedProjectService.getQuestionsDoc(anything())).twice();

      resetCalls(env.mockedProjectService);
      env.clickElement(env.addQuestionButton);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      verify(env.mockedProjectService.getQuestionsDoc(anything())).once();
    }));
  });

  describe('Edit Question', () => {
    it('should expand/collapse questions in book text', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 'MAT', 1);
      env.waitForQuestions();
      expect(env.textRows.length).toEqual(2);
      expect(env.questionEdits.length).toEqual(0);
      expect(env.component.itemVisible[id.toString()]).toBeFalsy();
      expect(env.component.questions[id.toString()].data.length).toBeGreaterThan(0);
      expect(env.component.questionCount(id.bookId, id.chapter)).toBeGreaterThan(0);

      env.simulateRowClick(0);
      expect(env.textRows.length).toEqual(3);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(5);
      expect(env.questionEdits.length).toEqual(2);

      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(3);
      expect(env.questionEdits.length).toEqual(0);
      env.simulateRowClick(0);
      expect(env.textRows.length).toEqual(2);
    }));

    it('should edit question', fakeAsync(() => {
      const env = new TestEnvironment();
      const id = new TextDocId('project01', 'MAT', 1);
      when(env.mockedQuestionDialogRef.afterClosed()).thenReturn(
        of({
          scriptureStart: 'MAT 3:3',
          scriptureEnd: '',
          text: ''
        })
      );
      env.waitForQuestions();
      env.simulateRowClick(0);
      env.simulateRowClick(1, id);
      expect(env.textRows.length).toEqual(5);
      expect(env.questionEdits.length).toEqual(2);
      verify(env.mockedProjectService.getQuestionsDoc(anything())).twice();

      resetCalls(env.mockedProjectService);
      env.clickElement(env.questionEdits[0]);
      verify(env.mockedMdcDialog.open(anything(), anything())).once();
      verify(env.mockedProjectService.getQuestionsDoc(anything())).never();
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
  mockedSFAdminAuthGuard: SFAdminAuthGuard = mock(SFAdminAuthGuard);
  mockedMdcDialog: MdcDialog = mock(MdcDialog);
  mockedQuestionDialogRef: MdcDialogRef<QuestionDialogComponent> = mock(MdcDialogRef);
  mockedNoticeService = mock(NoticeService);
  mockedProjectService: SFProjectService = mock(SFProjectService);
  mockedUserService: UserService = mock(UserService);
  mockedAuthService: AuthService = mock(AuthService);
  mockedRealtimeOfflineStore: RealtimeOfflineStore = mock(RealtimeOfflineStore);
  overlayContainer: OverlayContainer;

  constructor() {
    when(this.mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(this.mockedMdcDialog.open(anything(), anything())).thenReturn(instance(this.mockedQuestionDialogRef));
    when(this.mockedSFAdminAuthGuard.allowTransition(anything())).thenReturn(of(true));
    const projectData: SFProjectData = {
      texts: [
        { bookId: 'MAT', name: 'Matthew', chapters: [{ number: 1, lastVerse: 25 }] },
        { bookId: 'LUK', name: 'Luke', chapters: [{ number: 1, lastVerse: 80 }] }
      ]
    };
    const adapter = new MemoryRealtimeDocAdapter(OTJson0.type, 'project01', projectData);
    const projectDataDoc = new SFProjectDataDoc(adapter, instance(this.mockedRealtimeOfflineStore));
    when(this.mockedProjectService.getDataDoc('project01')).thenResolve(projectDataDoc);

    const text1_1id = new TextDocId('project01', 'MAT', 1);
    when(this.mockedProjectService.getQuestionsDoc(deepEqual(text1_1id))).thenResolve(
      this.createQuestionsDoc(text1_1id, [
        { id: 'q1Id', ownerRef: undefined, text: 'Book 1, Q1 text' },
        { id: 'q2Id', ownerRef: undefined, text: 'Book 1, Q2 text' }
      ])
    );
    const text1_3id = new TextDocId('project01', 'MAT', 3);
    when(this.mockedProjectService.getQuestionsDoc(deepEqual(text1_3id))).thenResolve(
      this.createQuestionsDoc(text1_3id, [])
    );
    const text2_1id = new TextDocId('project01', 'LUK', 1);
    when(this.mockedProjectService.getQuestionsDoc(deepEqual(text2_1id))).thenResolve(
      this.createQuestionsDoc(text2_1id, [{ id: 'q3Id', ownerRef: undefined, text: 'Book 2, Q3 text' }])
    );

    TestBed.configureTestingModule({
      imports: [DialogTestModule],
      declarations: [CheckingOverviewComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: SFAdminAuthGuard, useFactory: () => instance(this.mockedSFAdminAuthGuard) },
        { provide: MdcDialog, useFactory: () => instance(this.mockedMdcDialog) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedProjectService) },
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

  get textRows(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('mdc-list-item'));
  }

  get questionEdits(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('mdc-list-item button'));
  }

  waitForQuestions(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  /**
   * simulate row click since actually clicking on the row deosn't fire the selectionChange event
   */
  simulateRowClick(index: number, id?: TextDocId): void {
    let idStr: string;
    if (id) {
      idStr = id.toString();
    } else {
      idStr = this.component.texts[index].bookId;
    }
    this.component.itemVisible[idStr] = !this.component.itemVisible[idStr];
    this.fixture.detectChanges();
    flush();
  }

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = element.nativeElement as HTMLElement;
    }
    element.click();
    this.fixture.detectChanges();
    flush();
  }

  makeUserAProjectAdmin(isProjectAdmin: boolean = true) {
    this.component.isProjectAdmin$ = of(isProjectAdmin);
  }

  private createQuestionsDoc(id: TextDocId, data: Question[]): QuestionsDoc {
    const adapter = new MemoryRealtimeDocAdapter(OTJson0.type, id.toString(), data);
    return new QuestionsDoc(adapter, instance(this.mockedRealtimeOfflineStore));
  }
}
