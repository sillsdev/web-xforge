import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoMarkupComponent } from 'ngx-transloco-markup';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { DraftSourcesAsArrays, DraftSourcesService } from '../draft-sources.service';
import { LanguageCodesConfirmationComponent } from './language-codes-confirmation.component';

const mockI18nService = mock(I18nService);
const mockActivatedProject: ActivatedProjectService = mock(ActivatedProjectService);
const mockAuthService = mock(AuthService);
const mockDraftSourcesService = mock(DraftSourcesService);

describe('LanguageCodesConfirmationComponent', () => {
  configureTestingModule(() => ({
    imports: [TestTranslocoModule, UICommonModule, NoticeComponent, TranslocoMarkupComponent],
    providers: [
      { provide: I18nService, useMock: mockI18nService },
      { provide: ActivatedProjectService, useMock: mockActivatedProject },
      { provide: AuthService, useMock: mockAuthService },
      { provide: DraftSourcesService, useMock: mockDraftSourcesService }
    ]
  }));

  beforeEach(() => {
    when(mockActivatedProject.projectId).thenReturn('target');
    when(mockI18nService.getLanguageDisplayName(anything())).thenReturn('spanish');
    when(mockI18nService.enumerateList(anything())).thenReturn('es');
    when(mockAuthService.currentUserId).thenReturn('user1');
    when(mockActivatedProject.projectDoc).thenReturn({
      id: 'target',
      data: createTestProjectProfile({ userRoles: { user1: SFProjectRole.ParatextAdministrator } })
    } as SFProjectProfileDoc);
  });

  it('should show standard message', () => {
    const env = new TestEnvironment({ draftSources: getStandardDraftSources() });
    expect(env.component.sourceSideLanguageCodes.length).toEqual(1);
    expect(env.component.showSourceAndTargetLanguagesIdenticalWarning).toBe(false);
  });

  it('shows standard message when language codes are equivalent language', () => {
    const draftSources = getStandardDraftSources();
    // Both map to the Chinese language
    draftSources.draftingSources[0]!.writingSystem.tag = 'zh-CN';
    draftSources.trainingSources[0]!.writingSystem.tag = 'cmn-Hans';
    const env = new TestEnvironment({ draftSources });
    expect(env.component.sourceSideLanguageCodes.length).toEqual(1);
  });

  it('should show target and source language codes identical message', () => {
    const draftSources = getStandardDraftSources();
    draftSources.trainingTargets[0]!.writingSystem.tag = draftSources.trainingSources[0]!.writingSystem.tag;
    const env = new TestEnvironment({ draftSources });
    expect(env.component.sourceSideLanguageCodes.length).toEqual(1);
    expect(env.component.showSourceAndTargetLanguagesIdenticalWarning).toBe(true);
  });

  it('should show training source language codes different message', () => {
    const draftSources = getStandardDraftSources();
    draftSources.trainingSources.push({
      projectRef: 'source2',
      shortName: 'SP2',
      name: 'Source Project 2',
      paratextId: 'pt-sp2',
      writingSystem: { tag: 'zh' },
      texts: []
    });
    const env = new TestEnvironment({ draftSources });
    // Chinese as the additional training source, and Spanish for the training and drafting source
    expect(env.component.sourceSideLanguageCodes.length).toEqual(2);
    expect(env.component.showSourceAndTargetLanguagesIdenticalWarning).toBe(false);
  });

  it('can emit languages confirmed when checkbox is checked', () => {
    const env = new TestEnvironment({ draftSources: getStandardDraftSources() });
    const emitSpy = spyOn(env.component.languageCodesVerified, 'emit');
    env.component.confirmationChanged({ checked: true } as any);
    expect(emitSpy).toHaveBeenCalledWith(true);
  });
});

class TestEnvironment {
  component: LanguageCodesConfirmationComponent;
  fixture: ComponentFixture<LanguageCodesConfirmationComponent>;

  constructor(args: { draftSources: DraftSourcesAsArrays }) {
    when(mockDraftSourcesService.getDraftProjectSources()).thenReturn(of(args.draftSources));
    this.fixture = TestBed.createComponent(LanguageCodesConfirmationComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }
}

function getStandardDraftSources(): DraftSourcesAsArrays {
  return {
    trainingSources: [
      {
        projectRef: 'source',
        shortName: 'SP',
        name: 'Source Project',
        paratextId: 'pt-sp',
        writingSystem: { tag: 'es' },
        texts: []
      }
    ],
    trainingTargets: [
      {
        projectRef: 'target',
        shortName: 'TA',
        name: 'Target Project',
        paratextId: 'pt-ta',
        writingSystem: { tag: 'xyz' },
        texts: []
      }
    ],
    draftingSources: [
      {
        projectRef: 'source',
        shortName: 'SP',
        name: 'Source Project',
        paratextId: 'pt-sp',
        writingSystem: { tag: 'es' },
        texts: []
      }
    ]
  };
}
