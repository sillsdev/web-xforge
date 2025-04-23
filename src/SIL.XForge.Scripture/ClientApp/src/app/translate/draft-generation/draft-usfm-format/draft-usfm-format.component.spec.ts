import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DraftUsfmFormatComponent } from './draft-usfm-format.component';

describe('DraftUsfmFormatComponent', () => {
  let component: DraftUsfmFormatComponent;
  let fixture: ComponentFixture<DraftUsfmFormatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DraftUsfmFormatComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DraftUsfmFormatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
