import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LynxInsightActionPromptComponent } from './lynx-insight-action-prompt.component';

describe('LynxInsightActionPromptComponent', () => {
  let component: LynxInsightActionPromptComponent;
  let fixture: ComponentFixture<LynxInsightActionPromptComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LynxInsightActionPromptComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LynxInsightActionPromptComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });
});
