import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DraftSourcesComponent } from './draft-sources.component';

describe('DraftSourcesComponent', () => {
  let component: DraftSourcesComponent;
  let fixture: ComponentFixture<DraftSourcesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DraftSourcesComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(DraftSourcesComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
