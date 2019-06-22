import { ProjectUserRef } from './project-user';
import { Resource, ResourceRef } from './resource';
import { Site } from './site';

export class User extends Resource {
  static readonly TYPE: string = 'user';

  name?: string;
  email?: string;
  paratextId?: string;
  active?: boolean;
  avatarUrl?: string;
  role?: string;
  mobilePhone?: string;
  contactMethod?: 'email' | 'sms' | 'emailSms';
  birthday?: string;
  gender?: 'female' | 'male';
  authType?: 'paratext' | 'google' | 'account';
  site?: Site;

  projects?: ProjectUserRef[];

  constructor(init?: Partial<User>) {
    super(User.TYPE, init);
  }
}

export class UserRef extends ResourceRef {
  static readonly TYPE: string = User.TYPE;

  constructor(id: string) {
    super(UserRef.TYPE, id);
  }
}
