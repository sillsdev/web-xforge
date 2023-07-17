import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { cloneDeep } from 'lodash-es';
import { of } from 'rxjs';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';
import { Delta } from 'src/app/core/models/text-doc';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { SharedModule } from 'src/app/shared/shared.module';
import { TextComponent } from 'src/app/shared/text/text.component';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { DraftSegmentMap } from '../draft-generation';
import { DraftGenerationService } from '../draft-generation.service';
import { DraftViewerComponent } from './draft-viewer.component';

describe('DraftViewerComponent', () => {
  let component: DraftViewerComponent;
  let fixture: ComponentFixture<DraftViewerComponent>;
  let mockDraftGenerationService: jasmine.SpyObj<DraftGenerationService>;
  let mockActivatedProjectService: jasmine.SpyObj<ActivatedProjectService>;
  let mockProjectService: jasmine.SpyObj<SFProjectService>;
  let mockActivatedRoute: jasmine.SpyObj<ActivatedRoute>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(() => {
    mockDraftGenerationService = jasmine.createSpyObj('DraftGenerationService', ['getGeneratedDraft']);
    mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', ['get projectId', 'get projectDoc'], {
      projectId: 'targetProjectId',
      projectDoc: {
        data: {
          translateConfig: {
            source: {
              projectRef: 'sourceProjectId'
            }
          }
        }
      }
    });
    mockProjectService = jasmine.createSpyObj('SFProjectService', ['getProfile']);
    mockActivatedRoute = jasmine.createSpyObj('ActivatedRoute', ['paramMap']);
    mockRouter = jasmine.createSpyObj('Router', ['navigateByUrl']);

    TestBed.configureTestingModule({
      declarations: [DraftViewerComponent, TextComponent],
      imports: [UICommonModule, SharedModule],
      providers: [
        { provide: DraftGenerationService, useValue: mockDraftGenerationService },
        { provide: ActivatedProjectService, useValue: mockActivatedProjectService },
        { provide: SFProjectService, useValue: mockProjectService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DraftViewerComponent);
    component = fixture.componentInstance;
  });

  it('should initialize component correctly', () => {
    mockProjectService.getProfile.and.returnValue(Promise.resolve({ data: {} } as SFProjectProfileDoc));
    component.ngOnInit();
    expect(component.targetProjectId).toEqual('targetProjectId');
    expect(component.sourceProjectId).toEqual('sourceProjectId');
    expect(mockProjectService.getProfile).toHaveBeenCalledWith('sourceProjectId');
  });

  it('should populate draft text correctly', () => {
    component.currentBook = 1;
    component.currentChapter = 1;
    component.targetProjectId = 'targetProjectId';
    component.targetEditor = jasmine.createSpyObj('TextComponent', ['editor'], {
      editor: {
        getContents: jasmine.createSpy('getContents').and.returnValue(cloneDeep(delta_no_verse_2)),
        setContents: jasmine.createSpy('setContents')
      }
    });
    mockDraftGenerationService.getGeneratedDraft.and.returnValue(of(cloneDeep(draftSegmentMap)));
    component.preDraftTargetDelta = delta_no_verse_2;
    component.populateDraftText();
    expect(mockDraftGenerationService.getGeneratedDraft).toHaveBeenCalledWith('targetProjectId', 1, 1);
    expect(component.targetEditor.editor!.setContents).toHaveBeenCalledWith(delta_verse_2_suggested, 'api');
  });

  it('should apply draft correctly', () => {
    component.targetEditor = jasmine.createSpyObj('TextComponent', ['editor'], {
      editor: {
        getContents: jasmine.createSpy('getContents').and.returnValue(cloneDeep(delta_verse_2_suggested)),
        enable: jasmine.createSpy('enable'),
        setContents: jasmine.createSpy('setContents'),
        updateContents: jasmine.createSpy('updateContents'),
        disable: jasmine.createSpy('disable')
      }
    });
    component.preDraftTargetDelta = delta_no_verse_2;
    const cleanedOps = component.cleanDraftOps(cloneDeep(delta_verse_2_suggested).ops!);
    const draftDiff = delta_no_verse_2.diff(new Delta(cleanedOps));
    component.applyDraft();
    expect(component.targetEditor.editor!.enable).toHaveBeenCalledWith(true);
    expect(component.targetEditor.editor!.getContents).toHaveBeenCalled();
    expect(component.targetEditor.editor!.setContents).toHaveBeenCalledWith(delta_no_verse_2, 'silent');
    expect(component.targetEditor.editor!.updateContents).toHaveBeenCalledWith(draftDiff, 'user');
    expect(component.targetEditor.editor!.disable).toHaveBeenCalled();
    expect(component.isDraftApplied).toBeTrue();
  });

  it('should clean draft ops correctly', () => {
    const cleanedOps = component.cleanDraftOps(cloneDeep(delta_verse_2_suggested).ops!);
    expect(cleanedOps).toEqual(delta_verse_2_accepted.ops!);
  });

  it('should navigate to the correct URL for editing the book/chapter', () => {
    component.currentBook = 1;
    component.currentChapter = 2;
    component.targetProjectId = '123';
    component.editChapter();
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/projects/123/translate/GEN/2');
  });

  it('should navigate to the correct URL for the given book and chapter', () => {
    const book = 1;
    const chapter = 2;
    component.targetProjectId = '123';
    component.navigateBookChapter(book, chapter);
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/projects/123/draft-preview/GEN/2');
  });

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
      insert: {
        blank: true
      }
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
    }
  ]);
});
