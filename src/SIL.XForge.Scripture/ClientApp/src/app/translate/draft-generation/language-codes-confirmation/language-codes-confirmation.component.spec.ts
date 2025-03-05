import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoMarkupComponent } from 'ngx-transloco-markup';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { anything, mock, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { I18nService } from 'xforge-common/i18n.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { DraftSourcesAsSelectableProjectArrays } from '../draft-utils';
import { LanguageCodesConfirmationComponent } from './language-codes-confirmation.component';

describe('LanguageCodesConfirmationComponent', () => {
  let component: LanguageCodesConfirmationComponent;
  let fixture: ComponentFixture<LanguageCodesConfirmationComponent>;

  const mockI18nService = mock(I18nService);
  const mockActivatedProject: ActivatedProjectService = mock(ActivatedProjectService);
  const mockAuthService = mock(AuthService);

  configureTestingModule(() => ({
    imports: [TestTranslocoModule, UICommonModule, NoticeComponent, TranslocoMarkupComponent],
    providers: [
      { provide: I18nService, useMock: mockI18nService },
      { provide: ActivatedProjectService, useMock: mockActivatedProject },
      { provide: AuthService, useMock: mockAuthService }
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

    fixture = TestBed.createComponent(LanguageCodesConfirmationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should show standard message', () => {
    component.draftSources = getStandardDraftSources();
    fixture.detectChanges();
    expect(component.sourceSideLanguageCodes.length).toEqual(1);
    expect(component.showSourceAndTargetLanguagesIdenticalWarning).toBe(false);
  });

  it('shows standard message when language codes are equivalent language', () => {
    const draftSources = getStandardDraftSources();
    // Both map to the Chinese language
    draftSources.draftingSources[0]!.languageTag = 'zh-CN';
    draftSources.trainingSources[0]!.languageTag = 'cmn-Hans';
    component.draftSources = draftSources;
    fixture.detectChanges();
    expect(component.sourceSideLanguageCodes.length).toEqual(1);
  });

  it('should show target and source language codes identical message', () => {
    const draftSources = getStandardDraftSources();
    draftSources.trainingTargets[0]!.languageTag = draftSources.trainingSources[0]!.languageTag;
    component.draftSources = draftSources;
    fixture.detectChanges();
    expect(component.sourceSideLanguageCodes.length).toEqual(1);
    expect(component.showSourceAndTargetLanguagesIdenticalWarning).toBe(true);
  });

  it('should show training source language codes different message', () => {
    const draftSources = getStandardDraftSources();
    draftSources.trainingSources.push({
      shortName: 'SP2',
      name: 'Source Project 2',
      paratextId: 'pt-sp2',
      languageTag: 'zh'
    });
    component.draftSources = draftSources;
    fixture.detectChanges();
    expect(component.sourceSideLanguageCodes.length).toEqual(2);
    expect(component.showSourceAndTargetLanguagesIdenticalWarning).toBe(false);
  });

  it('can emit languages confirmed when checkbox is checked', () => {
    component.draftSources = getStandardDraftSources();
    fixture.detectChanges();
    const emitSpy = spyOn(component.languageCodesVerified, 'emit');
    component.confirmationChanged({ checked: true } as any);
    expect(emitSpy).toHaveBeenCalledWith(true);
  });
});

function getStandardDraftSources(): DraftSourcesAsSelectableProjectArrays {
  return {
    trainingSources: [
      {
        shortName: 'SP',
        name: 'Source Project',
        paratextId: 'pt-sp',
        languageTag: 'es'
      }
    ],
    trainingTargets: [
      {
        shortName: 'TA',
        name: 'Target Project',
        paratextId: 'pt-ta',
        languageTag: 'xyz'
      }
    ],
    draftingSources: [
      {
        shortName: 'SP',
        name: 'Source Project',
        paratextId: 'pt-sp',
        languageTag: 'es'
      }
    ]
  };
}
