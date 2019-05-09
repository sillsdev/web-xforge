import { DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';

import { SystemRole } from '../models/system-role';
import { User } from '../models/user';
import { NoticeService } from '../notice.service';
import { UserService } from '../user.service';

@Component({
  selector: 'app-sa-user-entry',
  templateUrl: './sa-user-entry.component.html',
  styleUrls: ['./sa-user-entry.component.scss']
})
export class SaUserEntryComponent implements OnInit {
  private static isConflict(error: any): boolean {
    if (!error) {
      return false;
    }
    if (!error.response) {
      return false;
    }
    return error.response.status === 409;
  }

  @Output() outputUserList: EventEmitter<boolean> = new EventEmitter<boolean>(false);

  accountUserForm: FormGroup;
  isSubmitted: boolean = false;
  emailPattern = '[a-zA-Z0-9.-_]{1,}@[a-zA-Z0-9.-]{2,}[.]{1}[a-zA-Z]{2,}';

  btnUserAdd: boolean = true;
  btnUserUpdate: boolean = false;
  btnChangePassword: boolean = false;

  showPasswordPanel: boolean = true;
  showActivateDeActivatePanel: boolean = false;

  userActivateDeactive: string;
  userLastLoginDate: string = '';
  userCreatedDate: string = '';
  headerTitle: string;

  roleList = [{ id: SystemRole.SystemAdmin, value: 'Administrator' }, { id: SystemRole.User, value: 'User' }];
  private readonly userRoleListIndex = 1;

  private _editUserId: string = '';

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly datePipe: DatePipe,
    private readonly userService: UserService,
    private readonly noticeService: NoticeService
  ) {
    this.accountUserForm = this.formBuilder.group({
      fullName: ['', Validators.compose([Validators.required])],
      username: [],
      email: ['', Validators.compose([Validators.required, Validators.email, Validators.pattern(this.emailPattern)])],
      role: ['', Validators.compose([Validators.required])],
      password: ['', Validators.compose([Validators.required, Validators.minLength(7)])],
      activateStatus: []
    });
  }

  ngOnInit(): void {
    this.editToAddReset();
  }

  @Input()
  set editUserId(value: string) {
    this._editUserId = value;
    if (this._editUserId) {
      this.headerTitle = 'Account details';
      this.btnUserAdd = false;
      this.btnUserUpdate = true;
      this.btnChangePassword = true;
      this.showPasswordPanel = false;
      this.showActivateDeActivatePanel = true;
      this.getCurrentUser(this._editUserId);
    } else {
      this.headerTitle = 'New account details';
      this.editToAddReset();
      this.accountUserForm.reset();
      this.role.patchValue(this.roleList[this.userRoleListIndex].id);
    }
  }

  get editUserId() {
    return this._editUserId;
  }

  get formControls() {
    return this.accountUserForm.controls;
  }

  get fullName() {
    return this.formControls.fullName;
  }

  get email() {
    return this.formControls.email;
  }

  get password() {
    return this.formControls.password;
  }

  get role() {
    return this.formControls.role;
  }

  get activateStatus() {
    return this.formControls.activateStatus;
  }

  editToAddReset(): void {
    if (!this.editUserId) {
      this.btnUserAdd = true;
      this.btnUserUpdate = false;
      this.btnChangePassword = false;
      this.showPasswordPanel = true;
      this.showActivateDeActivatePanel = false;
    }
    this.password.setValidators([Validators.required]);
    this.password.updateValueAndValidity();
  }

  onChangePassword(): void {
    this.showPasswordPanel = true;
    this.btnChangePassword = false;
    this.isSubmitted = true;
    this.password.markAsTouched();
  }

  async onUserAdd(): Promise<void> {
    this.isSubmitted = true;
    if (this.accountUserForm.invalid) {
      return;
    }

    const newUser: Partial<User> = {
      name: this.accountUserForm.value.fullName,
      username: this.accountUserForm.value.username,
      email: this.accountUserForm.value.email,
      role: this.accountUserForm.value.role,
      active: true,
      password: this.accountUserForm.value.password
    };
    try {
      await this.userService.onlineCreate(newUser);
    } catch (e) {
      if (SaUserEntryComponent.isConflict(e)) {
        this.noticeService.show('User account could not be created due to a conflict.');
        return;
      }
      throw e;
    } finally {
      this.isSubmitted = false;
    }
    this.accountUserForm.reset();
    this.noticeService.show('User account created successfully.');
    this.outputUserList.emit(true);
  }

  async onUpdate(): Promise<void> {
    if (!this.showPasswordPanel) {
      this.password.clearValidators();
      this.password.updateValueAndValidity();
    }
    if (this.accountUserForm.invalid) {
      return;
    }
    const updateUser: Partial<User> = {
      name: this.accountUserForm.value.fullName,
      username: this.accountUserForm.value.username,
      email: this.accountUserForm.value.email,
      role: this.accountUserForm.value.role,
      active: this.accountUserForm.value.activateStatus
    };
    if (this.accountUserForm.value.password != null) {
      // The password was changed, so we need to update the password property of our user
      updateUser.password = this.accountUserForm.value.password;
    }
    try {
      await this.userService.onlineUpdateAttributes(this.editUserId, updateUser);
    } catch (e) {
      if (SaUserEntryComponent.isConflict(e)) {
        this.noticeService.show('User account could not be updated due to a conflict.');
        return;
      }
      throw e;
    }
    this.accountUserForm.reset();
    this.noticeService.show('User account updated.');
    this.outputUserList.emit(true);
    this.editUserId = '';
    this.editToAddReset();
  }

  onChange(value: { checked: boolean }): void {
    value.checked ? (this.userActivateDeactive = 'Activated') : (this.userActivateDeactive = 'Deactive/Invited');
  }

  getCurrentUser(userId: string): void {
    this.btnUserAdd = false;
    this.btnUserUpdate = true;
    this.btnChangePassword = true;
    this.showPasswordPanel = false;
    this.showActivateDeActivatePanel = true;
    this.userService.onlineGet(userId).subscribe(response => {
      if (response != null) {
        this.accountUserForm.patchValue({
          fullName: response.data.name,
          username: response.data.username,
          email: response.data.email,
          role: response.data.role,
          activateStatus: response.data.active
        });
        if (
          response.data.site == null ||
          response.data.site.lastLogin == null ||
          response.data.site.lastLogin === '' ||
          Date.parse(response.data.site.lastLogin) <= 0
        ) {
          this.userLastLoginDate = 'Never';
        } else {
          this.userLastLoginDate = this.datePipe.transform(response.data.site.lastLogin, 'dd MMMM yyyy');
        }
        this.userCreatedDate = this.datePipe.transform(response.data.dateCreated, 'dd MMMM yyyy');
        this.activateStatus.setValue(response.data.active);
        this.onChange({ checked: response.data.active });
      }
    });
  }
}
