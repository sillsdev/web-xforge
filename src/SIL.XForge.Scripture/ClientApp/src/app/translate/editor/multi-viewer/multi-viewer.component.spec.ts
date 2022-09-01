import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MultiViewerComponent } from './multi-viewer.component';

describe('MultiViewerComponent', () => {
  let component: MultiViewerComponent;
  let fixture: ComponentFixture<MultiViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MultiViewerComponent]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MultiViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should have all avatars when the menu is closed', () => {
    component.viewers = [
      { displayName: 'v 1', avatarUrl: '', cursorColor: '', activeInEditor: false },
      { displayName: 'v 2', avatarUrl: '', cursorColor: '', activeInEditor: false },
      { displayName: 'v 3', avatarUrl: '', cursorColor: '', activeInEditor: false }
    ];
    expect(component.maxAvatars).withContext('setup').toEqual(3);

    expect(component.avatarViewers.length).toEqual(3);
  });

  it('should not have avatars when the menu is open', () => {
    component.viewers = [
      { displayName: 'v 1', avatarUrl: '', cursorColor: '', activeInEditor: false },
      { displayName: 'v 2', avatarUrl: '', cursorColor: '', activeInEditor: false },
      { displayName: 'v 3', avatarUrl: '', cursorColor: '', activeInEditor: false }
    ];

    component.isMenuOpen = true;

    expect(component.avatarViewers.length).toEqual(0);
  });

  it('should limit the avatars when there are many', () => {
    component.viewers = [
      { displayName: 'v 1', avatarUrl: '', cursorColor: '', activeInEditor: false },
      { displayName: 'v 2', avatarUrl: '', cursorColor: '', activeInEditor: false },
      { displayName: 'v 3', avatarUrl: '', cursorColor: '', activeInEditor: false },
      { displayName: 'v 4', avatarUrl: '', cursorColor: '', activeInEditor: false }
    ];
    expect(component.maxAvatars).withContext('setup').toEqual(3);

    expect(component.avatarViewers.length).toEqual(2);
  });

  it('should toggle the menu', () => {
    expect(component.isMenuOpen).withContext('setup').toBeFalse();

    component.toggleMenu();

    expect(component.isMenuOpen).toBeTrue();

    component.toggleMenu();

    expect(component.isMenuOpen).toBeFalse();
  });

  it('should close the menu', () => {
    component.isMenuOpen = true;
    expect(component.isMenuOpen).withContext('setup').toBeTrue();

    component.closeMenu();

    expect(component.isMenuOpen).toBeFalse();
  });
});
