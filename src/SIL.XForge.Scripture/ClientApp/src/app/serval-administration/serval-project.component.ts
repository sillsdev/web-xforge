import { Component, OnInit } from '@angular/core';
import { tap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectService } from '../core/sf-project.service';

@Component({
  selector: 'app-serval-project',
  templateUrl: './serval-project.component.html',
  styleUrls: ['./serval-project.component.scss'],
  imports: [UICommonModule],
  standalone: true
})
export class ServalProjectComponent extends SubscriptionDisposable implements OnInit {
  preTranslate = false;
  projectName = '';

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly projectService: SFProjectService
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(
      this.activatedProjectService.projectDoc$.pipe(
        filterNullish(),
        tap(projectDoc => {
          if (projectDoc.data == null) return;
          this.preTranslate = projectDoc.data.translateConfig.preTranslate;
          this.projectName = projectDoc.data.shortName + ' - ' + projectDoc.data.name;
        })
      )
    );
  }

  onUpdatePreTranslate(newValue: boolean): Promise<void> {
    return this.projectService.onlineSetPreTranslate(this.activatedProjectService.projectId!, newValue);
  }
}
