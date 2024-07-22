import { TestBed } from '@angular/core/testing';

import { ActivatedBookChapterService } from './activated-book-chapter.service';

describe('ActivatedBookChapterService', () => {
  let service: ActivatedBookChapterService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ActivatedBookChapterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
