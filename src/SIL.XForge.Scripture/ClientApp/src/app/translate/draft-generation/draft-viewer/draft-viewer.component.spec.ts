import { CommonModule } from '@angular/common';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, ActivatedRouteSnapshot, ActivationEnd, ParamMap, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { cloneDeep } from 'lodash-es';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { User } from 'realtime-server/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import * as RichText from 'rich-text';
import { of } from 'rxjs';
import { SharedModule } from 'src/app/shared/shared.module';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, MockTranslocoDirective, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectService } from '../../../core/sf-project.service';
import { isBadDelta } from '../../../shared/utils';
import { DraftSegmentMap } from '../draft-generation';
import { DraftGenerationService } from '../draft-generation.service';
import { SFProjectProfileDoc } from './../../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from './../../../core/models/sf-type-registry';
import { Delta, TextDoc, TextDocId } from './../../../core/models/text-doc';
import { DraftViewerComponent } from './draft-viewer.component';

describe('DraftViewerComponent', () => {
  const mockDraftGenerationService = mock(DraftGenerationService);
  const mockProjectService = mock(SFProjectService);
  const mockUserService = mock(UserService);
  const mockActivatedProjectService = mock(ActivatedProjectService);
  const mockActivatedRoute = mock(ActivatedRoute);
  const mockRouter = mock(Router);

  class TestEnvironment {
    fixture!: ComponentFixture<DraftViewerComponent>;
    component!: DraftViewerComponent;
    readonly targetProjectId = 'targetProjectId';
    readonly targetTextDocId = new TextDocId(this.targetProjectId, 1, 2, 'target');
    private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

    constructor(preInit?: () => void) {
      this.setup();

      if (preInit) {
        preInit();
      }

      this.init();
    }

    setup(): void {
      this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
        id: this.targetTextDocId.toString(),
        type: RichText.type.name,
        data: cloneDeep(delta_no_verse_2)
      });
      this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
        id: 'user01',
        data: createTestUser()
      });

      when(mockActivatedProjectService.projectId).thenReturn(this.targetProjectId);
      when(mockActivatedProjectService.projectDoc).thenReturn(projectProfileDoc);
      when(mockProjectService.getText(anything())).thenCall(id =>
        this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
      );
      when(mockProjectService.getProfile(anything())).thenResolve(cloneDeep(projectProfileDoc));
      when(mockProjectService.getProfile(anything())).thenResolve(cloneDeep(projectProfileDoc));
      when(mockUserService.getCurrentUser()).thenCall(() =>
        this.realtimeService.subscribe(UserDoc.COLLECTION, 'user01')
      );
      when(mockRouter.events).thenReturn(
        of(new ActivationEnd({ params: { projectId: this.targetProjectId } } as unknown as ActivatedRouteSnapshot))
      );
      when(mockDraftGenerationService.getGeneratedDraft(anything(), anything(), anything())).thenReturn(
        of(cloneDeep(draftSegmentMap))
      );
      when(mockActivatedRoute.paramMap).thenReturn(
        of({
          get: (p: string) => {
            if (p === 'bookId') {
              return 'GEN';
            }
            if (p === 'chapter') {
              return '2';
            }
            return null;
          }
        } as ParamMap)
      );
    }

    init(): void {
      this.fixture = TestBed.createComponent(DraftViewerComponent);
      this.component = this.fixture.componentInstance;
      this.fixture.detectChanges();
      tick();
    }
  }

  configureTestingModule(() => ({
    declarations: [DraftViewerComponent, MockTranslocoDirective],
    imports: [
      UICommonModule,
      CommonModule,
      SharedModule,
      RouterTestingModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      TranslocoMarkupModule,
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      NoopAnimationsModule
    ],
    providers: [
      { provide: DraftGenerationService, useMock: mockDraftGenerationService },
      { provide: ActivatedProjectService, useMock: mockActivatedProjectService },
      { provide: SFProjectService, useMock: mockProjectService },
      { provide: ActivatedRoute, useMock: mockActivatedRoute },
      { provide: UserService, useMock: mockUserService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: Router, useMock: mockRouter }
    ]
  }));

  it('should initialize component correctly', fakeAsync(() => {
    const env = new TestEnvironment();

    expect(env.component.targetProjectId).toEqual('targetProjectId');
    expect(env.component.sourceProjectId).toEqual('sourceProjectId');
    expect(env.component.projectSettingsUrl).toEqual('/projects/targetProjectId/settings');
    expect(env.component.targetProject).toEqual(projectProfileDoc.data);
    verify(mockProjectService.getProfile('sourceProjectId')).once();
  }));

  it('should call populateDraftText method after both editors are loaded', fakeAsync(() => {
    const env = new TestEnvironment();
    const spyPopulateDraftText = spyOn(env.component, 'populateDraftText').and.callThrough();

    tick();
    env.fixture.detectChanges();
    tick();

    expect(env.component.isDraftApplied).toBe(false);
    expect(env.component.preDraftTargetDelta).toEqual(delta_no_verse_2);
    expect(env.component.books).toEqual([1, 2]);
    expect(env.component.currentBook).toEqual(1);
    expect(env.component.currentChapter).toEqual(2);
    expect(spyPopulateDraftText).toHaveBeenCalledTimes(1);
  }));

  it('should populate draft text correctly', fakeAsync(() => {
    const env = new TestEnvironment();

    tick();
    env.fixture.detectChanges();
    tick();

    verify(mockDraftGenerationService.getGeneratedDraft('targetProjectId', 1, 2)).once();
    expect(env.component.hasDraft).toBeTrue();
    expect(env.component.targetEditor.editor!.getContents()).toEqual(delta_verse_2_suggested);
  }));

  it('should apply draft correctly', fakeAsync(() => {
    const env = new TestEnvironment();

    tick();
    env.fixture.detectChanges();
    tick();

    const draftEditor = env.component.targetEditor.editor!;

    const spyEditorSetContents = spyOn(draftEditor, 'setContents').and.callThrough();
    const spyEditorEnable = spyOn(draftEditor, 'enable').and.callThrough();
    const spyEditorUpdateContents = spyOn(draftEditor, 'updateContents').and.callThrough();
    const spyEditorDisable = spyOn(draftEditor, 'disable').and.callThrough();

    const cleanedOps = env.component.cleanDraftOps(cloneDeep(delta_verse_2_suggested).ops!);
    const draftDiff = delta_no_verse_2.diff(new Delta(cleanedOps));

    env.component.applyDraft();
    expect(spyEditorSetContents).toHaveBeenCalledWith(delta_no_verse_2, 'silent');
    expect(spyEditorEnable).toHaveBeenCalledWith(true);
    expect(spyEditorUpdateContents).toHaveBeenCalledWith(draftDiff, 'user');
    expect(spyEditorDisable).toHaveBeenCalledTimes(1);
    expect(isBadDelta(env.component.targetEditor.editor?.getContents().ops!)).toBeFalse();
    tick();
  }));

  it('should clean draft ops correctly', fakeAsync(() => {
    const env = new TestEnvironment();
    const cleanedOps = env.component.cleanDraftOps(cloneDeep(delta_verse_2_suggested).ops!);
    expect(cleanedOps).toEqual(delta_verse_2_accepted.ops!);
  }));

  it('should navigate to the correct URL for editing the book/chapter', fakeAsync(() => {
    const env = new TestEnvironment();
    env.component.currentBook = 1;
    env.component.currentChapter = 2;
    env.component.targetProjectId = '123';
    env.component.editChapter();
    verify(mockRouter.navigateByUrl('/projects/123/translate/GEN/2')).once();
    expect(mockRouter.navigateByUrl('/projects/123/translate/GEN/2')).toBeTruthy();
  }));

  it('should navigate to first book in project if url book is not in project', fakeAsync(() => {
    new TestEnvironment(() => {
      when(mockActivatedRoute.paramMap).thenReturn(
        of({
          get: (p: string) => {
            if (p === 'bookId') {
              return 'LEV';
            }
            if (p === 'chapter') {
              return '2';
            }
            return null;
          }
        } as ParamMap)
      );
    });

    verify(
      mockRouter.navigateByUrl('/projects/targetProjectId/draft-preview/GEN/1', deepEqual({ replaceUrl: true }))
    ).once();
    expect(mockRouter.navigateByUrl('/projects/targetProjectId/draft-preview/GEN/1')).toBeTruthy();
  }));

  it('should navigate to the correct URL for the given book and chapter', fakeAsync(() => {
    const env = new TestEnvironment();
    const book = 1;
    const chapter = 2;
    env.component.currentBook = 2;
    env.component.currentChapter = 3;
    env.component.targetProjectId = '123';
    env.component.navigateBookChapter(book, chapter);
    verify(mockRouter.navigateByUrl('/projects/123/draft-preview/GEN/2', undefined)).once();
    expect(mockRouter.navigateByUrl('/projects/123/draft-preview/GEN/2')).toBeTruthy();
  }));

  it('should navigate to the given chapter of the given book if chapter is in range', fakeAsync(() => {
    const env = new TestEnvironment();
    env.component.currentBook = 2;
    env.component.currentChapter = 2;
    env.component.setBook(1, 2);
    expect(env.component.currentBook).toEqual(1);
    expect(env.component.currentChapter).toEqual(2);
  }));

  it('should navigate to the first chapter of the given book if chapter is out of range', fakeAsync(() => {
    new TestEnvironment(() => {
      when(mockActivatedRoute.paramMap).thenReturn(
        of({
          get: (p: string) => {
            if (p === 'bookId') {
              return 'GEN';
            }
            if (p === 'chapter') {
              return '3';
            }
            return null;
          }
        } as ParamMap)
      );
    });

    verify(
      mockRouter.navigateByUrl('/projects/targetProjectId/draft-preview/GEN/1', deepEqual({ replaceUrl: true }))
    ).once();
    expect(mockRouter.navigateByUrl('/projects/targetProjectId/draft-preview/GEN/1')).toBeTruthy();
  }));

  it('should navigate to the first chapter of the new book when user changes book', fakeAsync(() => {
    const env = new TestEnvironment();
    env.component.currentBook = 2;
    env.component.currentChapter = 2;
    env.component.onBookChange(1);
    verify(mockRouter.navigateByUrl('/projects/targetProjectId/draft-preview/GEN/1', undefined)).once();
    expect(mockRouter.navigateByUrl('/projects/targetProjectId/draft-preview/GEN/1')).toBeTruthy();
  }));

  const projectProfileDoc = {
    data: {
      writingSystem: {
        tag: 'en'
      },
      translateConfig: {
        source: {
          projectRef: 'sourceProjectId'
        }
      },
      texts: [
        {
          bookNum: 1,
          chapters: [
            {
              number: 1,
              lastVerse: 10
            },
            {
              number: 2,
              lastVerse: 10
            }
          ]
        },
        {
          bookNum: 2,
          chapters: [
            {
              number: 1,
              lastVerse: 10
            },
            {
              number: 2,
              lastVerse: 10
            },
            {
              number: 3,
              lastVerse: 10
            }
          ]
        }
      ]
    }
  } as SFProjectProfileDoc;

  const draftSegmentMap: DraftSegmentMap = {
    verse_1_1: 'This is verse 1. ',
    verse_1_2: 'This is verse 2. ',
    verse_1_3: 'This is verse 3. '
  };

  const delta_no_verse_2 = new Delta([
    {
      insert: {
        chapter: {
          number: '1',
          style: 'c'
        }
      }
    },
    {
      attributes: {
        initial: true,
        segment: 'p_1',
        'para-contents': true
      },
      insert: { blank: true }
    },
    {
      attributes: {
        'para-contents': true
      },
      insert: {
        verse: {
          number: '1',
          style: 'v'
        }
      }
    },
    {
      attributes: {
        segment: 'verse_1_1',
        'para-contents': true
      },
      insert: 'Existing verse 1. '
    },
    {
      attributes: {
        'para-contents': true
      },
      insert: {
        verse: {
          number: '2',
          style: 'v'
        }
      }
    },
    {
      attributes: {
        segment: 'verse_1_2',
        'para-contents': true
      },
      insert: { blank: true }
    },
    {
      attributes: {
        'para-contents': true
      },
      insert: {
        verse: {
          number: '3',
          style: 'v'
        }
      }
    },
    {
      attributes: {
        segment: 'verse_1_3',
        'para-contents': true
      },
      insert: 'And God said '
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

  const delta_verse_2_suggested = new Delta([
    {
      insert: {
        chapter: {
          number: '1',
          style: 'c'
        }
      }
    },
    {
      attributes: {
        initial: true,
        segment: 'p_1',
        'para-contents': true
      },
      insert: { blank: true }
    },
    {
      attributes: {
        'para-contents': true
      },
      insert: {
        verse: {
          number: '1',
          style: 'v'
        }
      }
    },
    {
      attributes: {
        segment: 'verse_1_1',
        'para-contents': true
      },
      insert: 'Existing verse 1. '
    },
    {
      attributes: {
        'para-contents': true
      },
      insert: {
        verse: {
          number: '2',
          style: 'v'
        }
      }
    },
    {
      attributes: {
        segment: 'verse_1_2',
        'para-contents': true,
        draft: true
      },
      insert: 'This is verse 2. '
    },
    {
      attributes: {
        'para-contents': true
      },
      insert: {
        verse: {
          number: '3',
          style: 'v'
        }
      }
    },
    {
      attributes: {
        segment: 'verse_1_3',
        'para-contents': true
      },
      insert: 'And God said '
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

  const delta_verse_2_accepted = new Delta([
    {
      insert: {
        chapter: {
          number: '1',
          style: 'c'
        }
      }
    },
    {
      attributes: {
        initial: true,
        segment: 'p_1',
        'para-contents': true
      },
      insert: { blank: true }
    },
    {
      attributes: {
        'para-contents': true
      },
      insert: {
        verse: {
          number: '1',
          style: 'v'
        }
      }
    },
    {
      attributes: {
        segment: 'verse_1_1',
        'para-contents': true
      },
      insert: 'Existing verse 1. '
    },
    {
      attributes: {
        'para-contents': true
      },
      insert: {
        verse: {
          number: '2',
          style: 'v'
        }
      }
    },
    {
      attributes: {
        segment: 'verse_1_2',
        'para-contents': true
      },
      insert: 'This is verse 2. '
    },
    {
      attributes: {
        'para-contents': true
      },
      insert: {
        verse: {
          number: '3',
          style: 'v'
        }
      }
    },
    {
      attributes: {
        segment: 'verse_1_3',
        'para-contents': true
      },
      insert: 'And God said '
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
});
