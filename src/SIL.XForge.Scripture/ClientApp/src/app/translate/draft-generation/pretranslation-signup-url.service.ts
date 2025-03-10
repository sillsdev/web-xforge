import { Inject, Injectable, InjectionToken } from '@angular/core';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
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
      projectParam: 'Paratext Project Short Name',
      languageParam: 'Project Language ISO Code'
    })
  }
);

@Injectable({
  providedIn: 'root'
})
export class PreTranslationSignupUrlService {
  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly userService: UserService,
    @Inject(PRE_TRANSLATION_SIGNUP_URL_CONFIG) private readonly linkConfig: PreTranslationSignupUrlConfig
  ) {}

  async generateSignupUrl(): Promise<string> {
    const user: Readonly<User | undefined> = (
      await this.userService.getCurrentUser(new DocSubscription('PreTranslationSignupUrlService'))
    ).data;
    const project: Readonly<SFProjectProfile | undefined> = this.activatedProject.projectDoc?.data;
    const languageCode: string | undefined = project?.writingSystem.tag;

    const baseLink: string = this.linkConfig.baseLink;
    const nameToken: string = this.buildParam(this.linkConfig.nameParam, user?.name);
    const emailToken: string = this.buildParam(this.linkConfig.emailParam, user?.email);
    const projectNameToken: string = this.buildParam(this.linkConfig.projectParam, project?.shortName);
    const languageToken: string =
      languageCode?.length === 3 ? this.buildParam(this.linkConfig.languageParam, languageCode) : '';

    return `${baseLink}?${nameToken}&${emailToken}&${projectNameToken}&${languageToken}`;
  }

  private buildParam(key: string, value: string | undefined): string {
    return `${encodeURIComponent(key)}=${encodeURIComponent(value ?? '')}`;
  }
}
