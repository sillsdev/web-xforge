import { TestBed } from '@angular/core/testing';

import { EditorInsightRenderService } from './editor-insight-render.service';

describe('EditorInsightRenderService', () => {
  let service: EditorInsightRenderService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EditorInsightRenderService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
