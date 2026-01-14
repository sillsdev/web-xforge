import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { mock } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { provideTestOnlineStatus } from 'xforge-common/test-online-status-providers';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { ParatextService } from '../../../core/paratext.service';
import { ProjectNotificationService } from '../../../core/project-notification.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { DraftImportWizardComponent } from './draft-import-wizard.component';

const mockI18nService = mock(I18nService);
const mockMatDialogRef = mock(MatDialogRef<DraftImportWizardComponent, boolean>);
const mockParatextService = mock(ParatextService);
const mockProjectNotificationService = mock(ProjectNotificationService);
const mockProjectService = mock(SFProjectService);
const mockTextDocService = mock(TextDocService);
const mockActivatedProjectService = mock(ActivatedProjectService);

describe('DraftImportWizardComponent', () => {
  let env: TestEnvironment;
  const buildDto: BuildDto = {
    additionalInfo: { dateFinished: '2026-01-14T15:16:17.18+00:00' }
  } as BuildDto;

  configureTestingModule(() => ({
    imports: [getTestTranslocoModule()],
    providers: [
      provideTestOnlineStatus(),
      { provide: I18nService, useMock: mockI18nService },
      { provide: MatDialogRef, useMock: mockMatDialogRef },
      { provide: MAT_DIALOG_DATA, useValue: buildDto },
      { provide: ParatextService, useMock: mockParatextService },
      { provide: ProjectNotificationService, useMock: mockProjectNotificationService },
      { provide: SFProjectService, useMock: mockProjectService },
      { provide: TextDocService, useMock: mockTextDocService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      provideNoopAnimations()
    ]
  }));

  beforeEach(async () => {
    env = new TestEnvironment();
  });

  it('shows step 1', () => {
    expect(env.fixture.nativeElement).not.toBeNull();
  });
});

class TestEnvironment {
  component: DraftImportWizardComponent;
  fixture: ComponentFixture<DraftImportWizardComponent>;

  constructor() {
    this.fixture = TestBed.createComponent(DraftImportWizardComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }
}
