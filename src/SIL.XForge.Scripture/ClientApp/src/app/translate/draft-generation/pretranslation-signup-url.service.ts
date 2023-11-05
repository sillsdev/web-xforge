import { Inject, Injectable, InjectionToken } from '@angular/core';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UserService } from 'xforge-common/user.service';

export interface PreTranslationSignupUrlConfig {
  baseLink: string;
  nameParam: string;
  emailParam: string;
  projectParam: string;
  languageParam: string;
}

export const PRE_TRANSLATION_SIGNUP_URL_CONFIG = new InjectionToken<PreTranslationSignupUrlConfig>(
  'PRE_TRANSLATION_SIGNUP_LINK_CONFIG',
  {
    providedIn: 'root',
    factory: () => ({
      baseLink: 'https://app.smartsheet.com/b/form/305798a45a664d8585ac74e72241d8cc',
      nameParam: 'Name',
      emailParam: 'Email',
      projectParam: 'Project Short Name',
      languageParam: 'Language of Translation Project'
    })
  }
);

@Injectable({
  providedIn: 'root'
})
export class PreTranslationSignupUrlService {
  private baseLink = 'https://app.smartsheet.com/b/form/305798a45a664d8585ac74e72241d8cc';

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly userService: UserService,
    @Inject(PRE_TRANSLATION_SIGNUP_URL_CONFIG) private readonly linkConfig: PreTranslationSignupUrlConfig
  ) {}

  async generateSignupUrl(): Promise<string> {
    const user: Readonly<User | undefined> = (await this.userService.getCurrentUser()).data;
    const project: Readonly<SFProjectProfile | undefined> = this.activatedProject.projectDoc?.data;

    const nameToken = this.buildParam(this.linkConfig.nameParam, user?.name);
    const emailToken = this.buildParam(this.linkConfig.emailParam, user?.email);
    const projectNameToken = this.buildParam(this.linkConfig.projectParam, project?.shortName);
    const languageToken = this.buildParam(this.linkConfig.languageParam, project?.writingSystem.tag);

    return `${this.baseLink}?${nameToken}&${emailToken}&${projectNameToken}&${languageToken}`;
  }

  private buildParam(key: string, value: string | undefined): string {
    return `${encodeURIComponent(key)}=${encodeURIComponent(value ?? '')}`;
  }
}
