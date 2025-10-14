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
    const user: Readonly<User | undefined> = (await this.userService.getCurrentUser()).data;
    const project: Readonly<SFProjectProfile | undefined> = this.activatedProject.projectDoc?.data;
    const languageCode: string | undefined = project?.writingSystem.tag;

    const url = new URL(this.linkConfig.baseLink);
    const searchParams = new URLSearchParams();

    // Omit the email if it's a transparent authentication noreply email
    const userEmail = user?.email?.includes('@users.noreply.scriptureforge.org') ? undefined : user?.email;

    // Add parameters to the URL
    if (user?.name) searchParams.set(this.linkConfig.nameParam, user.name);
    if (userEmail) searchParams.set(this.linkConfig.emailParam, userEmail);
    if (project?.shortName) searchParams.set(this.linkConfig.projectParam, project.shortName);

    // Only add language parameter if it's a 3-character code
    if (languageCode?.length === 3) searchParams.set(this.linkConfig.languageParam, languageCode);

    url.search = searchParams.toString();
    return url.toString();
  }
}
