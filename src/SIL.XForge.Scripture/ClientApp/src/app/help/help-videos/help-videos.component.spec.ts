import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HelpVideosComponent } from './help-videos.component';

describe('HelpVideosComponent', () => {
  let component: HelpVideosComponent;
  let fixture: ComponentFixture<HelpVideosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HelpVideosComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(HelpVideosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
