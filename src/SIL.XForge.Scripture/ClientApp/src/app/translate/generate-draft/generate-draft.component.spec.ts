import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GenerateDraftComponent } from './generate-draft.component';

describe('GenerateDraftComponent', () => {
  let component: GenerateDraftComponent;
  let fixture: ComponentFixture<GenerateDraftComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GenerateDraftComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(GenerateDraftComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
