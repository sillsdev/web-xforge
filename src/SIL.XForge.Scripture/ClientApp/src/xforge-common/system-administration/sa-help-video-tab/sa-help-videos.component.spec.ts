import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SaHelpVideosComponent } from './sa-help-videos.component';

describe('HelpVideosComponent', () => {
  let component: SaHelpVideosComponent;
  let fixture: ComponentFixture<SaHelpVideosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SaHelpVideosComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SaHelpVideosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
