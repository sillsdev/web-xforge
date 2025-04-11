import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LynxInsightOverlayComponent } from './lynx-insight-overlay.component';

describe('LynxInsightOverlayComponent', () => {
  let component: LynxInsightOverlayComponent;
  let fixture: ComponentFixture<LynxInsightOverlayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LynxInsightOverlayComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LynxInsightOverlayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
});
