import { ComponentFixture, TestBed } from '@angular/core/testing';

import { mock } from 'ts-mockito';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { I18nService } from '../../../../xforge-common/i18n.service';
import { NoticeComponent } from '../../../shared/notice/notice.component';
import { DraftSourcesAsArrays } from '../draft-sources.service';
import { LanguageCodesConfirmationComponent } from './language-codes-confirmation.component';

describe('LanguageCodesConfirmationComponent', () => {
  let component: LanguageCodesConfirmationComponent;
  let fixture: ComponentFixture<LanguageCodesConfirmationComponent>;

  const mockI18nService = mock(I18nService);

  configureTestingModule(() => ({
    imports: [TestTranslocoModule, UICommonModule, NoticeComponent],
    providers: [{ provide: I18nService, useMock: mockI18nService }]
  }));

  beforeEach(() => {
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

  it('should show target and source language codes identical message', () => {
    const draftSources = getStandardDraftSources();
    draftSources.trainingTargets[0]!.writingSystem.tag = draftSources.trainingSources[0]!.writingSystem.tag;
    component.draftSources = draftSources;
    fixture.detectChanges();
    expect(component.sourceSideLanguageCodes.length).toEqual(1);
    expect(component.showSourceAndTargetLanguagesIdenticalWarning).toBe(true);
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
    component.draftSources = draftSources;
    fixture.detectChanges();
    expect(component.sourceSideLanguageCodes.length).toEqual(3);
    expect(component.showSourceAndTargetLanguagesIdenticalWarning).toBe(false);
  });

  // TODO: test that language codes confirmed emits
});

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
