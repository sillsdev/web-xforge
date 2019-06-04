import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { NoticeService } from '../../notice.service';
import { ProjectService } from '../../project.service';
import { UICommonModule } from '../../ui-common.module';
import { CollaboratorsComponent } from './collaborators.component';

describe('CollaboratorsComponent', () => {
  it('should display error when email is invalid', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailInput, 'notavalidemail');
    expect(env.component.userInviteForm.controls.email.hasError('email')).toBe(true);
    env.setTextFieldValue(env.emailInput, 'notavalidemail@bad');
    expect(env.component.userInviteForm.controls.email.hasError('email')).toBe(true);
    expect(env.component.inviteDisabled).toBe(true);
    env.setTextFieldValue(env.emailInput, 'validemail@example.com');
    expect(env.component.userInviteForm.controls.email.hasError('email')).toBe(false);
    expect(env.component.inviteDisabled).toBe(false);
  }));

  it('should display notice', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setTextFieldValue(env.emailInput, 'user@example.com');
    env.clickButton(env.inviteButton);
    verify(env.mockedProjectService.onlineInvite('project01', 'user@example.com')).once();
    verify(env.mockedNoticeService.show(anything())).once();
    expect().nothing();
  }));
});

class TestEnvironment {
  fixture: ComponentFixture<CollaboratorsComponent>;
  component: CollaboratorsComponent;

  mockedNoticeService = mock(NoticeService);
  mockedProjectService = mock(ProjectService);
  mockedActivatedRoute = mock(ActivatedRoute);

  constructor() {
    when(this.mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(this.mockedProjectService.onlineInvite('project01', anything())).thenResolve();
    TestBed.configureTestingModule({
      declarations: [CollaboratorsComponent],
      imports: [UICommonModule],
      providers: [
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: ProjectService, useFactory: () => instance(this.mockedProjectService) }
      ]
    });

    this.fixture = TestBed.createComponent(CollaboratorsComponent);
    this.component = this.fixture.componentInstance;

    this.fixture.detectChanges();
    tick();
  }

  get emailInput(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#email-input');
  }

  get inviteButton(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#btn-invite');
  }

  clickButton(element: HTMLElement) {
    element.click();
    this.fixture.detectChanges();
    tick();
  }

  setTextFieldValue(element: HTMLElement, value: string) {
    const inputElem: HTMLInputElement = element.querySelector('input');
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    this.fixture.detectChanges();
    tick();
  }
}
