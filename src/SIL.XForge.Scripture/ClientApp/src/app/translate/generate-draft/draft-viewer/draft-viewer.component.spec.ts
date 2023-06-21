import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DraftViewerComponent } from './draft-viewer.component';

describe('DraftViewerComponent', () => {
  let component: DraftViewerComponent;
  let fixture: ComponentFixture<DraftViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DraftViewerComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DraftViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
