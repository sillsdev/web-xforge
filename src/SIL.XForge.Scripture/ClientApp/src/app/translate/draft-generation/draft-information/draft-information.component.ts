import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { AuthService } from 'xforge-common/auth.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { BuildDto } from '../../../machine-api/build-dto';

@Component({
    selector: 'app-draft-information',
    imports: [UICommonModule, CommonModule],
    templateUrl: './draft-information.component.html'
})
export class DraftInformationComponent {
  @Input() draftJob?: BuildDto;

  constructor(private readonly authService: AuthService) {}

  get isServalAdmin(): boolean {
    return this.authService.currentUserRoles.includes(SystemRole.ServalAdmin);
  }

  get canShowAdditionalInfo(): boolean {
    return this.draftJob?.additionalInfo != null && this.isServalAdmin;
  }
}
