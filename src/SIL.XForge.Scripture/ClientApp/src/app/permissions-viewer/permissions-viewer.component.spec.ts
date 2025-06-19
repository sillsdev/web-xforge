import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PermissionsViewerComponent } from './permissions-viewer.component';

describe('PermissionsViewerComponent', () => {
  let component: PermissionsViewerComponent;
  let fixture: ComponentFixture<PermissionsViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PermissionsViewerComponent]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PermissionsViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
