import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Delta } from 'rich-text';
import { of } from 'rxjs';
import { EDITOR_READY_TIMEOUT, TextComponent } from 'src/app/shared/text/text.component';
import { anything, instance, mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { configureTestingModule } from 'xforge-common/test-utils';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { SharedModule } from '../../../shared/shared.module';
import { DraftSegmentMap } from '../../draft-generation/draft-generation';
import { DraftGenerationService } from '../../draft-generation/draft-generation.service';
import { DraftViewerService } from '../../draft-generation/draft-viewer/draft-viewer.service';
import { EditorDraftComponent } from './editor-draft.component';

const mockDraftGenerationService = mock(DraftGenerationService);
const mockI18nService = mock(I18nService);
const mockDraftViewerService = mock(DraftViewerService);
const mockTargetTextComponent = mock(TextComponent);

describe('EditorDraftComponent', () => {
  let fixture: ComponentFixture<EditorDraftComponent>;
  let component: EditorDraftComponent;

  configureTestingModule(() => ({
    declarations: [EditorDraftComponent],
    imports: [
      MatProgressBarModule,
      SharedModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: DraftGenerationService, useMock: mockDraftGenerationService },
      { provide: DraftViewerService, useMock: mockDraftViewerService },
      { provide: I18nService, useMock: mockI18nService }
    ]
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(EditorDraftComponent);
    component = fixture.componentInstance;

    component.projectId = 'targetProjectId';
    component.bookNum = 1;
    component.chapter = 1;
    component.isRightToLeft = false;
    component.targetText = instance(mockTargetTextComponent);
  });

  it('should populate draft text correctly', fakeAsync(() => {
    when(mockDraftGenerationService.getGeneratedDraft('targetProjectId', 1, 1)).thenReturn(of(draftMap));
    when(mockTargetTextComponent.editor).thenReturn({ getContents: () => targetDelta } as any);
    when(mockDraftViewerService.toDraftOps(draftMap, targetDelta.ops!, anything())).thenReturn(draftDelta.ops!);

    fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);

    expect(component.draftCheckState).toEqual('draft-present');
    expect(component.draftText.editor!.getContents().ops).toEqual(draftDelta.ops);
  }));

  describe('getLocalizedBookChapter', () => {
    it('should return an empty string if bookNum or chapter is undefined', () => {
      component.bookNum = undefined;
      component.chapter = 1;
      expect(component['getLocalizedBookChapter']()).toEqual('');

      component.bookNum = 1;
      component.chapter = undefined;
      expect(component['getLocalizedBookChapter']()).toEqual('');
    });

    it('should return a localized book and chapter if both are not null', () => {
      when(mockI18nService.localizeBook(1)).thenReturn('Localized Book');
      component.bookNum = 1;
      component.chapter = 1;
      expect(component['getLocalizedBookChapter']()).toEqual('Localized Book 1');
    });
  });
});

const draftMap: DraftSegmentMap = {
  verse_1_1: 'Draft verse 1. ',
  verse_1_2: 'Draft verse 2. '
};

const draftDelta = new Delta([
  {
    attributes: {
      segment: 'verse_1_1',
      'para-contents': true,
      draft: true
    },
    insert: 'Draft verse 1. '
  },
  {
    attributes: {
      segment: 'verse_1_2',
      'para-contents': true,
      draft: true
    },
    insert: 'Draft verse 2. '
  },
  {
    insert: '\n',
    attributes: {
      para: {
        style: 'p'
      }
    }
  }
]);

const targetDelta = new Delta([
  {
    attributes: {
      segment: 'verse_1_1',
      'para-contents': true
    },
    insert: 'Existing verse 1. '
  },
  {
    attributes: {
      segment: 'verse_1_2',
      'para-contents': true
    },
    insert: 'Existing verse 2. '
  },
  {
    insert: '\n',
    attributes: {
      para: {
        style: 'p'
      }
    }
  }
]);
