import { MdcDialog, MdcDialogRef, MdcSelect } from '@angular-mdc/web';
import { CUSTOM_ELEMENTS_SCHEMA, DebugElement, NgModule } from '@angular/core';
import { fakeAsync, flush, tick } from '@angular/core/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ErrorStateMatcher, ShowOnDirtyErrorStateMatcher } from '@angular/material';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { merge } from '@orbit/utils';
import { of } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';

import { ngfModule } from 'angular-file';
import { AuthService } from '../auth.service';
import { Site } from '../models/site';
import { User } from '../models/user';
import { NoticeService } from '../notice.service';
import { ParatextService } from '../paratext.service';
import { UICommonModule } from '../ui-common.module';
import { UserService } from '../user.service';
import { DeleteAccountDialogComponent } from './delete-account-dialog/delete-account-dialog.component';
import { MyAccountComponent } from './my-account.component';

describe('MyAccountComponent', () => {
  let env: TestEnvironment;
  const date = new Date(Date.now());
  date.setDate(date.getDate() - 1);
  beforeEach(() => {
    env = new TestEnvironment(
      new User({
        name: 'bob smith',
        email: 'bob@example.com',
        contactMethod: 'email',
        mobilePhone: '+123 11 2222-33-4444',
        gender: 'male',
        site: { currentProjectId: 'testproject01', lastLogin: date.toISOString() } as Site
      })
    );
  });

  it('should have a relevant title', () => {
    const title = env.fixture.debugElement.componentInstance.title;
    expect(title).toEqual('Account details - Scripture Forge');
    const header = env.header2.textContent;
    expect(header).toEqual('Account details');
  });

  it('should have avatar', () => {
    expect(env.avatars.length).toBeGreaterThan(0);
  });

  it('should display last login date', () => {
    expect(env.lastLogin.textContent).toContain('Last login 1 day ago');
  });

  // This tests that various UI icons etc are shown or not shown,
  // as data is edited and submitted, such as
  // the update button being disabled, the green check icon,
  // arrow icon, and spinner.
  // The test goes thru a sequence of actions, verifying state and icons.
  it('should update spinner, arrow, check, and disabled, depending on activity', fakeAsync(() => {
    const originalName = env.component.userFromDatabase.name;
    expect(env.component.formGroup.get('name').value).toEqual(originalName, 'test setup problem');

    env.verifyStates(
      'name',
      {
        state: env.component.elementState.InSync,
        updateButtonEnabled: false,
        arrow: true,
        inputEnabled: true
      },
      env.updateButton('name').nativeElement
    );

    // change name on page
    const newName = 'robert';
    expect(originalName).not.toBe(newName, 'test set up wrong');
    env.setTextFieldValue(env.nameInput, newName);

    env.verifyStates(
      'name',
      {
        state: env.component.elementState.Dirty,
        updateButtonEnabled: true,
        arrow: true,
        inputEnabled: true
      },
      env.updateButton('name').nativeElement
    );

    // click update
    env.updateButton('name').nativeElement.click();
    env.fixture.detectChanges();

    env.verifyStates(
      'name',
      {
        state: env.component.elementState.Submitting,
        updateButtonEnabled: false,
        arrow: false,
        inputEnabled: false
      },
      env.updateButton('name').nativeElement
    );

    // The spinner shows during networking. Time passes. Finish networking with flush()
    // before checking that the spinner is gone.
    flush();
    env.fixture.detectChanges();

    env.verifyStates(
      'name',
      {
        state: env.component.elementState.Submitted,
        updateButtonEnabled: false,
        arrow: false,
        inputEnabled: true
      },
      env.updateButton('name').nativeElement
    );

    // We don't need to test the fake database, but this failing is an early indication
    // of what may be about to go wrong.
    expect(env.component.userFromDatabase.name).toBe(newName);

    // modify text
    const newerName = 'Bobby';
    env.setTextFieldValue(env.nameInput, newerName);

    env.verifyStates(
      'name',
      {
        state: env.component.elementState.Dirty,
        updateButtonEnabled: true,
        arrow: true,
        inputEnabled: true
      },
      env.updateButton('name').nativeElement
    );

    // Modify text back to what it is in the database. In other words, manually editing
    // it back to a 'clean state'.
    env.setTextFieldValue(env.nameInput, newName);

    env.verifyStates(
      'name',
      {
        state: env.component.elementState.InSync,
        updateButtonEnabled: false,
        arrow: true,
        inputEnabled: true
      },
      env.updateButton('name').nativeElement
    );
  }));

  it('should set gender to null', fakeAsync(() => {
    expect(env.component.formGroup.get('gender').value).toBe('male');
    env.selectValue(env.genderSelect, 'unspecified');
    tick();

    expect(env.component.formGroup.get('gender').value).toBe('unspecified');
    expect(env.genderSelect.nativeElement.innerText).toContain('-- please select one --');
    const updatedUser: Partial<User> = { gender: null };
    verify(env.mockedUserService.onlineUpdateCurrentUserAttributes(deepEqual(updatedUser))).once();
  }));

  it('handles network error', fakeAsync(() => {
    const technicalDetails = 'squirrel chewed thru line. smoke lost.';
    when(env.mockedUserService.onlineUpdateCurrentUserAttributes(anything())).thenReject({ stack: technicalDetails });

    const originalName = env.component.userFromDatabase.name;
    expect(env.component.formGroup.get('name').value).toEqual(originalName, 'test setup problem');

    // change name on page
    const newName = 'robert';
    expect(originalName).not.toEqual(newName, 'test set up wrong');
    env.setTextFieldValue(env.nameInput, newName);

    // click update
    env.clickButton(env.updateButton('name'));

    env.verifyStates(
      'name',
      {
        state: env.component.elementState.Error,
        updateButtonEnabled: true,
        arrow: false,
        inputEnabled: true
      },
      env.updateButton('name').nativeElement
    );

    expect(env.component.formGroup.get('name').value).toEqual(
      newName,
      'input should contain new name that failed to transmit'
    );
  }));

  // TODO SF-178: include this test after SMS notification is implemented
  xit('handles network error for toggle buttons', fakeAsync(() => {
    const technicalDetails = 'squirrel chewed thru line. smoke lost.';
    when(env.mockedUserService.onlineUpdateCurrentUserAttributes(anything())).thenReject({ stack: technicalDetails });

    const originalvalue = env.component.userFromDatabase.contactMethod;
    expect(env.component.formGroup.get('contactMethod').value).toEqual(originalvalue, 'test setup problem');

    // change value on page
    const newValue = 'sms';
    expect(originalvalue).not.toEqual(newValue, 'test set up wrong');
    env.component.formGroup.get('contactMethod').setValue(newValue);
    env.fixture.detectChanges();

    env.contactMethodToggle('sms').nativeElement.click();
    env.fixture.detectChanges();
    expect(env.component.formGroup.get('contactMethod').value).toEqual(newValue, 'test setup problem');

    env.verifyStates('contactMethod', {
      state: env.component.elementState.Submitting,
      inputEnabled: false
    });

    // Time passes
    flush();
    env.fixture.detectChanges();
    expect(env.component.userFromDatabase.contactMethod).toEqual(originalvalue, 'test setup problem?');

    expect(env.component.formGroup.get('contactMethod').value).toEqual(
      originalvalue,
      'should have set form value back to original value'
    );

    env.verifyStates('contactMethod', {
      state: env.component.elementState.Error,
      inputEnabled: true
    });
  }));

  it('handles network error for combobox (select)', fakeAsync(() => {
    const technicalDetails = 'squirrel chewed thru line. smoke lost.';
    when(env.mockedUserService.onlineUpdateCurrentUserAttributes(anything())).thenReject({ stack: technicalDetails });

    const newValue = 'female';
    const originalValue = env.component.userFromDatabase.gender;
    expect(originalValue).not.toEqual(newValue, 'test set up wrong');
    expect(env.component.formGroup.get('gender').value).toEqual(originalValue, 'test setup problem');

    // change value on page
    env.selectValue(env.genderSelect, newValue);
    env.verifyStates('gender', {
      state: env.component.elementState.Submitting,
      inputEnabled: false
    });

    // Time passes
    flush();
    env.fixture.detectChanges();
    expect(env.component.userFromDatabase.gender).toEqual(originalValue, 'test setup problem?');

    expect(env.component.formGroup.get('gender').value).toEqual(
      originalValue,
      'should have set form value back to original value'
    );

    env.verifyStates('gender', {
      state: env.component.elementState.Error,
      inputEnabled: true
    });
  }));

  describe('validation', () => {
    it('error if email address removed', fakeAsync(() => {
      expect(env.component.userFromDatabase.email).toBe('bob@example.com');
      // Delete email from form
      env.setTextFieldValue(env.emailInput, '');

      env.verifyStates(
        'email',
        {
          state: env.component.elementState.Invalid,
          updateButtonEnabled: false,
          arrow: true,
          inputEnabled: true
        },
        env.updateButton('email').nativeElement
      );

      // Expect specific error message
      expect(env.component.formGroup.get('email').hasError('required')).toBe(true);
      expect((env.getHelperText(env.emailInput.parent).nativeElement as HTMLElement).innerText).toContain(
        'must supply a valid email'
      );
    }));

    describe('validate email pattern', () => {
      it('good email pattern means no error and enabled update button', fakeAsync(() => {
        env.expectEmailPatternIsGood('bob_smith+extension@lunar-astronaut.technology');
      }));

      it('bad email pattern means error message and disabled update button', fakeAsync(() => {
        env.expectEmailPatternIsBad('bob smith@example.com');
      }));

      xdescribe('by-hand, more extensive pattern checking', () => {
        it('no error for good email pattern', fakeAsync(() => {
          const goodEmail1 = 'john@example.com';
          expect(env.userInDatabase.email).not.toEqual(goodEmail1, 'setup');

          env.expectEmailPatternIsGood(goodEmail1);
          env.expectEmailPatternIsGood('bob.james.smith.smitheyson@lunar-astronaut.technology');
          env.expectEmailPatternIsGood('bob_smith@example.com');
          env.expectEmailPatternIsGood('bob+extension@example.com');
          env.expectEmailPatternIsGood('a@w.org');
        }));

        it('error for bad email pattern', fakeAsync(() => {
          const badEmailPatterns = [
            'bob',
            'example.com',
            '@',
            'bob@',
            '@example.com',
            'bob@example',
            'bob@.com',
            '.bob@example.com',
            'bob@.example.com',
            'bob@example.com.',
            'bob@example..com',
            'bob@example.a',
            'bob smith@example.com',
            'bob@exam ple.com',
            'bob@example.co m',
            ' bob@example.com',
            'bob @example.com',
            'bob@ example.com',
            'bob@example .com',
            'bob@example. com',
            'bob@example.com ',
            '*@example.com',
            'bob@@.com',
            'bob@!.com',
            'bob@example.&',
            'bob@example*com',
            'bob$bob@example.com',
            'bob@example$example.com',
            'bob@example.foo$foo.com',
            'bob@example.c$om'
          ];
          for (const badEmailPattern of badEmailPatterns) {
            env.expectEmailPatternIsBad(badEmailPattern);
          }
        }));
      });
    });
  });

  // TODO SF-178: include this test after SMS notification is implemented
  xdescribe('contactMethod restrictions', () => {
    it('cannot select email if no email address is set', fakeAsync(() => {
      env.userInDatabase.email = '';
      env.userInDatabase.contactMethod = 'sms';
      env.component.reloadFromDatabase();
      env.fixture.detectChanges();
      expect(env.component.userFromDatabase.email).toEqual('', 'setup');
      expect(env.component.formGroup.get('email').value).toEqual('', 'setup');
      expect(env.component.userFromDatabase.contactMethod).not.toEqual('email', 'setup');
      expect(env.component.formGroup.get('contactMethod').value).not.toEqual('email', 'setup');

      expect(env.contactMethodToggle('email').nativeElement.firstChild.disabled).toBe(true);
      expect(env.contactMethodToggle('emailSms').nativeElement.firstChild.disabled).toBe(true);
    }));

    it('cannot select sms if no mobile phone number is set', fakeAsync(() => {
      env.userInDatabase.mobilePhone = '';
      env.userInDatabase.contactMethod = 'email';
      env.component.reloadFromDatabase();
      env.fixture.detectChanges();
      expect(env.component.userFromDatabase.mobilePhone).toEqual('', 'setup');
      expect(env.component.formGroup.get('mobilePhone').value).toEqual('', 'setup');
      expect(env.component.userFromDatabase.contactMethod).not.toEqual('sms', 'setup');
      expect(env.component.formGroup.get('contactMethod').value).not.toEqual('sms', 'setup');

      expect(env.contactMethodToggle('sms').nativeElement.firstChild.disabled).toBe(true);
      expect(env.contactMethodToggle('emailSms').nativeElement.firstChild.disabled).toBe(true);
    }));

    it('cannot select email or sms if no email address or phone is set', fakeAsync(() => {
      env.userInDatabase.email = '';
      env.userInDatabase.mobilePhone = '';
      env.userInDatabase.contactMethod = null;
      env.component.reloadFromDatabase();
      env.fixture.detectChanges();
      expect(env.component.userFromDatabase.email).toEqual('', 'setup');
      expect(env.component.formGroup.get('email').value).toEqual('', 'setup');
      expect(env.component.userFromDatabase.mobilePhone).toEqual('', 'setup');
      expect(env.component.formGroup.get('mobilePhone').value).toEqual('', 'setup');
      expect(env.component.userFromDatabase.contactMethod).toEqual(null, 'setup');
      expect(env.component.formGroup.get('contactMethod').value).toEqual(null, 'setup');

      expect(env.contactMethodToggle('sms').nativeElement.firstChild.disabled).toBe(true);
      expect(env.contactMethodToggle('email').nativeElement.firstChild.disabled).toBe(true);
      expect(env.contactMethodToggle('emailSms').nativeElement.firstChild.disabled).toBe(true);
    }));

    it('deleting phone number disables and unsets sms contact method', fakeAsync(() => {
      env.userInDatabase.contactMethod = 'sms';
      env.component.reloadFromDatabase();
      env.fixture.detectChanges();
      expect(env.component.userFromDatabase.mobilePhone.length).toBeGreaterThan(3, 'setup');
      expect(env.component.formGroup.get('mobilePhone').value.length).toBeGreaterThan(3, 'setup');
      expect(env.component.userFromDatabase.contactMethod).toEqual('sms', 'setup');
      expect(env.component.formGroup.get('contactMethod').value).toEqual('sms', 'setup');

      expect(env.contactMethodToggle('sms').nativeElement.firstChild.disabled).toBe(false);

      env.component.formGroup.get('mobilePhone').setValue('');
      env.component.formGroup.get('mobilePhone').markAsDirty();
      env.fixture.detectChanges();

      // Don't disable sms yet until phone is committed.
      expect(env.contactMethodToggle('sms').nativeElement.firstChild.disabled).toBe(false);

      env.clickButton(env.updateButton('mobilePhone'));

      expect(env.contactMethodToggle('sms').nativeElement.firstChild.disabled).toBe(true);
      expect(env.contactMethodToggle('emailSms').nativeElement.firstChild.disabled).toBe(true);
      expect(env.component.userFromDatabase.contactMethod).toEqual(null);
      expect(env.component.formGroup.get('contactMethod').value).toEqual(null); // or at least not sms or emailSms
      expect(env.component.controlStates.get('contactMethod')).toBe(env.component.elementState.InSync);
    }));

    it('deleting phone number does not disable or unset email contact method', fakeAsync(() => {
      env.userInDatabase.contactMethod = 'email';
      env.component.reloadFromDatabase();
      env.fixture.detectChanges();
      expect(env.component.userFromDatabase.mobilePhone.length).toBeGreaterThan(3, 'setup');
      expect(env.component.formGroup.get('mobilePhone').value.length).toBeGreaterThan(3, 'setup');
      expect(env.component.userFromDatabase.contactMethod).toEqual('email', 'setup');
      expect(env.component.formGroup.get('contactMethod').value).toEqual('email', 'setup');

      expect(env.contactMethodToggle('email').nativeElement.firstChild.disabled).toBe(false);

      env.component.formGroup.get('mobilePhone').setValue('');
      env.component.formGroup.get('mobilePhone').markAsDirty();
      env.fixture.detectChanges();

      expect(env.contactMethodToggle('email').nativeElement.firstChild.disabled).toBe(false);

      env.clickButton(env.updateButton('mobilePhone'));

      expect(env.contactMethodToggle('sms').nativeElement.firstChild.disabled).toBe(true);
      expect(env.contactMethodToggle('emailSms').nativeElement.firstChild.disabled).toBe(true);
      expect(env.contactMethodToggle('email').nativeElement.firstChild.disabled).toBe(false);
      expect(env.component.userFromDatabase.contactMethod).toEqual('email');
      expect(env.component.formGroup.get('contactMethod').value).toEqual('email');
      expect(env.component.controlStates.get('contactMethod')).toBe(env.component.elementState.InSync);
    }));
  });

  describe('Linked accounts', () => {
    it('should give the option to link a paratext account', fakeAsync(() => {
      expect(env.component.isLinkedToParatext).toBeFalsy();
      expect(env.connectParatextButton.nativeElement.textContent).toContain('Connect to Paratext');
      env.setParatextUsername('Johnny Paratext');
      env.fixture.detectChanges();
      expect(env.paratextLinkLabel.nativeElement.textContent).toContain('Johnny Paratext');
      expect(env.unlinkParatextButton.nativeElement.textContent).toContain('Remove link');
    }));

    it('should remove linked paratext account', fakeAsync(() => {
      env.setParatextUsername('Johnny Paratext');
      env.fixture.detectChanges();
      expect(env.unlinkParatextButton.nativeElement.textContent).toContain('Remove link');
      env.clickButton(env.unlinkParatextButton);
      verify(env.mockedUserService.onlineUnlinkParatextAccount()).once();
      expect(env.paratextLinkLabel).toBeNull();
      expect(env.connectParatextButton.nativeElement.textContent).toContain('Connect to Paratext');
    }));

    // TODO: Add tests for linked google account
  });

  describe('delete account', () => {
    it('should have a title and a delete account button', fakeAsync(() => {
      expect(env.deleteAccountElement.nativeElement.querySelector('mdc-card h2').textContent).toContain(
        'Delete my account'
      );
      expect(env.deleteAccountElement.nativeElement.querySelector('mdc-card h2').textContent).toContain(
        env.userInDatabase.name
      );
    }));

    it('should bring up a dialog if button is clicked', fakeAsync(() => {
      when(env.mockedDeleteAccountDialogRef.afterClosed()).thenReturn(of('confirmed'));
      when(env.mockedDeleteAccountDialog.open(anything(), anything())).thenReturn(
        instance(env.mockedDeleteAccountDialogRef)
      );
      expect(env.deleteAccountButton.nativeElement.textContent).toContain('Delete my account');
      env.clickButton(env.deleteAccountButton);
      verify(env.mockedDeleteAccountDialog.open(anything(), anything())).once();
    }));

    it('should delete account if requested', fakeAsync(() => {
      when(env.mockedDeleteAccountDialogRef.afterClosed()).thenReturn(of('confirmed'));
      when(env.mockedDeleteAccountDialog.open(anything(), anything())).thenReturn(
        instance(env.mockedDeleteAccountDialogRef)
      );
      env.clickButton(env.deleteAccountButton);
      verify(env.mockedDeleteAccountDialog.open(anything(), anything())).once();
      verify(env.mockedUserService.onlineDelete(anything())).once();
      expect().nothing();
    }));

    it('should not delete account if cancelled', fakeAsync(() => {
      when(env.mockedDeleteAccountDialogRef.afterClosed()).thenReturn(of('cancel'));
      when(env.mockedDeleteAccountDialog.open(anything(), anything())).thenReturn(
        instance(env.mockedDeleteAccountDialogRef)
      );
      env.clickButton(env.deleteAccountButton);
      verify(env.mockedDeleteAccountDialog.open(anything(), anything())).once();
      verify(env.mockedUserService.onlineDelete(anything())).never();
      expect().nothing();
    }));
  });
});

@NgModule({
  declarations: [DeleteAccountDialogComponent, MyAccountComponent],
  imports: [NoopAnimationsModule, ngfModule, RouterTestingModule, UICommonModule],
  exports: [DeleteAccountDialogComponent, MyAccountComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  // ShowOnDirtyErrorStateMatcher helps form errors show up during unit testing.
  providers: [{ provide: ErrorStateMatcher, useClass: ShowOnDirtyErrorStateMatcher }],
  entryComponents: [DeleteAccountDialogComponent, MyAccountComponent]
})
class TestModule {}

class TestEnvironment {
  component: MyAccountComponent;
  fixture: ComponentFixture<MyAccountComponent>;

  mockedUserService: UserService;
  mockedParatextService: ParatextService;
  mockedDeleteAccountDialog: MdcDialog;
  mockedDeleteAccountDialogRef: MdcDialogRef<DeleteAccountDialogComponent>;
  mockedNoticeService: NoticeService;
  mockedAuthService: AuthService;

  private substituteParatextUsername: string;

  constructor(public userInDatabase: User) {
    this.mockedUserService = mock(UserService);
    this.mockedParatextService = mock(ParatextService);
    this.mockedDeleteAccountDialog = mock(MdcDialog);
    this.mockedDeleteAccountDialogRef = mock(MdcDialogRef);
    this.mockedNoticeService = mock(NoticeService);
    this.mockedAuthService = mock(AuthService);

    when(this.mockedUserService.getCurrentUser()).thenReturn(of(this.userInDatabase));
    when(this.mockedUserService.currentUserId).thenReturn('user01');
    when(this.mockedParatextService.getParatextUsername()).thenReturn(of(this.substituteParatextUsername));
    when(this.mockedUserService.onlineUnlinkParatextAccount()).thenCall(() => {
      this.setParatextUsername(null);
      return Promise.resolve();
    });
    when(this.mockedUserService.onlineUpdateCurrentUserAttributes(anything())).thenCall(
      this.mockUserServiceUpdateUserAttributes()
    );
    when(this.mockedNoticeService.show(anything())).thenResolve();

    TestBed.configureTestingModule({
      imports: [TestModule],
      providers: [
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: ParatextService, useFactory: () => instance(this.mockedParatextService) },
        { provide: MdcDialog, useFactory: () => instance(this.mockedDeleteAccountDialog) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: AuthService, useFactory: () => instance(this.mockedAuthService) }
      ],
      declarations: []
    });

    this.fixture = TestBed.createComponent(MyAccountComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }

  get nameInput(): DebugElement {
    return this.fixture.debugElement.query(By.css('#name-field'));
  }

  get emailInput(): DebugElement {
    return this.fixture.debugElement.query(By.css('#email-field'));
  }

  get genderSelect(): DebugElement {
    return this.fixture.debugElement.query(By.css('#gender-select'));
  }

  get header2(): HTMLElement {
    return this.fixture.nativeElement.querySelector('h2');
  }

  get lastLogin(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#last-login');
  }

  get paratextLinkElement(): DebugElement {
    return this.fixture.debugElement.query(By.css('#paratext-link'));
  }

  get paratextLinkLabel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#paratext-link-label'));
  }

  get connectParatextButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#connect-paratext-button'));
  }

  get unlinkParatextButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#unlink-paratext-button'));
  }

  get deleteAccountElement(): DebugElement {
    return this.fixture.debugElement.query(By.css('#delete-account'));
  }

  get deleteAccountButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('#delete-account-button'));
  }

  get avatars(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('app-avatar'));
  }

  /** Handler for mockUserService.updateUserAttributes that updates the fake database. */
  mockUserServiceUpdateUserAttributes(): (updatedAttributes: Partial<User>) => Promise<User> {
    return (updatedAttributes: Partial<User>) => {
      return new Promise<User>(resolve => {
        setTimeout(() => {
          merge(this.userInDatabase, updatedAttributes);
          resolve();
        }, 0);
      });
    };
  }

  /** After calling, flush(); to make the database promise resolve. */
  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    flush();
    this.fixture.detectChanges();
  }

  buttonIcon(controlName: string): DebugElement {
    return this.fixture.debugElement.query(By.css(`#${controlName}-button-icon`));
  }

  setParatextUsername(name: string): void {
    this.substituteParatextUsername = name;
    this.component.paratextUsername = this.substituteParatextUsername;
  }

  updateButton(controlName: string): DebugElement {
    return this.fixture.debugElement.query(By.css(`#${controlName}-update-button`));
  }

  contactMethodToggle(toggleName: string): DebugElement {
    return this.fixture.debugElement.query(By.css(`mat-button-toggle[value="${toggleName}"]`));
  }

  comboItem(value: string): DebugElement {
    return this.fixture.debugElement.query(By.css(`option[value="${value}"]`));
  }

  getHelperText(formField: DebugElement): DebugElement {
    return formField.query(By.css('mdc-helper-text'));
  }

  setTextFieldValue(elem: DebugElement, value: string): void {
    const inputElem: HTMLInputElement = elem.nativeElement.querySelector('input');
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    tick();
    this.fixture.detectChanges();
  }

  selectValue(field: DebugElement, value: string): void {
    const select: MdcSelect = field.componentInstance;
    select.value = value;
    this.fixture.detectChanges();
  }

  expectEmailPatternIsBad(badEmail: string) {
    this.setTextFieldValue(this.emailInput, badEmail);
    expect(this.component.formGroup.get('email').hasError('email')).toBe(true);
    expect((this.getHelperText(this.emailInput.parent).nativeElement as HTMLElement).innerText).toContain(
      'valid email address'
    );
    this.verifyStates(
      'email',
      {
        state: this.component.elementState.Invalid,
        updateButtonEnabled: false,
        arrow: true,
        inputEnabled: true
      },
      this.updateButton('email').nativeElement
    );
  }

  expectEmailPatternIsGood(goodEmail: string) {
    this.setTextFieldValue(this.emailInput, goodEmail);
    expect(this.component.formGroup.controls.email.errors).toBeNull();
    this.verifyStates(
      'email',
      {
        state: this.component.elementState.Dirty,
        updateButtonEnabled: true,
        arrow: true,
        inputEnabled: true
      },
      this.updateButton('email').nativeElement
    );
  }

  /**
   * Verify states of controls associated with a specifc datum.
   * Controls using an Update button can make use of updateButtonEnabled and arrow. */
  verifyStates(
    controlName: string,
    expected: {
      state: any;
      updateButtonEnabled?: boolean;
      arrow?: boolean;
      inputEnabled: boolean;
    },
    updateButton?: any
  ) {
    expect(this.component.controlStates.get(controlName)).toBe(expected.state);
    expect(this.component.formGroup.get(controlName).enabled).toBe(expected.inputEnabled, controlName + '.enabled');

    if (expected.updateButtonEnabled !== undefined) {
      expect(updateButton.disabled).not.toBe(expected.updateButtonEnabled, controlName + ' update button enabled');
    }

    if (expected.arrow !== undefined) {
      expect(this.buttonIcon(controlName) !== null).toBe(expected.arrow, controlName + ' arrow');
    }
  }
}
