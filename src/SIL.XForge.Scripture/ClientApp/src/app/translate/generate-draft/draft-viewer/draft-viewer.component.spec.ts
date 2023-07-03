import { QueryList } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';
import { Delta } from 'src/app/core/models/text-doc';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { TextComponent } from 'src/app/shared/text/text.component';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { DraftGenerationService, DraftSegmentMap } from '../draft-generation.service';
import { DraftViewerComponent } from './draft-viewer.component';
import { DraftViewerService } from './draft-viewer.service';

describe('DraftViewerComponent', () => {
  let component: DraftViewerComponent;
  let fixture: ComponentFixture<DraftViewerComponent>;
  let mockDraftGenerationService: jasmine.SpyObj<DraftGenerationService>;
  let mockDraftViewerService: jasmine.SpyObj<DraftViewerService>;
  let mockActivatedProjectService: jasmine.SpyObj<ActivatedProjectService>;
  let mockProjectService: jasmine.SpyObj<SFProjectService>;
  let mockActivatedRoute: jasmine.SpyObj<ActivatedRoute>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockI18nService: jasmine.SpyObj<I18nService>;

  beforeEach(() => {
    mockDraftGenerationService = jasmine.createSpyObj('DraftGenerationService', ['getGeneratedDraft']);
    mockDraftViewerService = jasmine.createSpyObj('DraftViewerService', ['hasDraftOps', 'toDraftOps']);
    mockActivatedProjectService = jasmine.createSpyObj('ActivatedProjectService', ['get projectId', 'get projectDoc'], {
      projectId: 'testProjectId',
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
    mockI18nService = jasmine.createSpyObj('I18nService', []);

    TestBed.configureTestingModule({
      declarations: [DraftViewerComponent, TextComponent],
      providers: [
        { provide: DraftGenerationService, useValue: mockDraftGenerationService },
        { provide: DraftViewerService, useValue: mockDraftViewerService },
        { provide: ActivatedProjectService, useValue: mockActivatedProjectService },
        { provide: SFProjectService, useValue: mockProjectService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        { provide: Router, useValue: mockRouter },
        { provide: I18nService, useValue: mockI18nService }
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
    component.targetEditor = jasmine.createSpyObj('TextComponent', ['editor', 'loaded'], {
      editor: jasmine.createSpyObj('QuillEditor', ['getContents', 'setContents'])
    });
    component.sourceEditor = jasmine.createSpyObj('TextComponent', ['loaded']);
    component.targetEditorQueryList = jasmine.createSpyObj('QueryList', ['changes']);
    spyOnProperty(component.targetEditorQueryList, 'changes', 'get').and.returnValue(of({}));
    spyOn(component.targetEditor.editor!, 'getContents').and.returnValue(delta_no_verse_2);
    mockDraftGenerationService.getGeneratedDraft.and.returnValue(of(draftSegmentMap));
    component.populateDraftText();
    expect(mockDraftGenerationService.getGeneratedDraft).toHaveBeenCalledWith('targetProjectId', 1, 1);
    expect(mockDraftViewerService.hasDraftOps).toHaveBeenCalled();
    expect(mockDraftViewerService.toDraftOps).toHaveBeenCalled();
    expect(component.targetEditor.editor!.setContents).toHaveBeenCalledWith(delta_verse_2_suggested);
  });

  it('should apply draft correctly', () => {
    component.targetEditor = jasmine.createSpyObj('TextComponent', ['editor', 'loaded'], {
      editor: jasmine.createSpyObj('QuillEditor', ['getContents', 'setContents'])
    });
    spyOn(component.targetEditor.editor!, 'getContents').and.returnValue(delta_verse_2_suggested);
    component.applyDraft();
    expect(component.targetEditor.editor!.enable).toHaveBeenCalledWith(true);
    expect(component.targetEditor.editor!.setContents).toHaveBeenCalledWith(delta_verse_2_accepted);
    expect(component.targetEditor.editor!.disable).toHaveBeenCalled();
    expect(component.isDraftApplied).toBeTrue();
  });

  it('should clean draft ops correctly', () => {
    const cleanedOps = component.cleanDraftOps(delta_verse_2_suggested.ops!);
    expect(cleanedOps).toEqual(delta_verse_2_accepted.ops!);
  });

  it('should navigate to the correct URL for editing the book/chapter', () => {
    const routerSpy = spyOn(mockRouter, 'navigateByUrl');
    component.currentBook = 1;
    component.currentChapter = 2;
    component.targetProjectId = '123';

    component.editChapter();

    expect(routerSpy).toHaveBeenCalledWith('/projects/123/translate/GEN/2');
  });

  it('should navigate to the correct URL for the given book and chapter', () => {
    const routerSpy = spyOn(mockRouter, 'navigateByUrl');
    const book = 1;
    const chapter = 2;
    component.targetProjectId = '123';

    component.navigateBookChapter(book, chapter);

    expect(routerSpy).toHaveBeenCalledWith('/projects/123/translate/GEN/2');
  });

  const draftSegmentMap: DraftSegmentMap = {
    verse_1_1: 'This is verse 1.',
    verse_1_2: 'This is verse 2.',
    verse_1_3: 'This is verse 3.'
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
