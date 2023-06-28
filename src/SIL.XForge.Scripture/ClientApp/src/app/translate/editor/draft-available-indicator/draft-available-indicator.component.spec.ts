import { ComponentFixture, TestBed } from '@angular/core/testing';
import { mock } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { DraftAvailableIndicatorComponent } from './draft-available-indicator.component';

describe('DraftAvailableIndicatorComponent', () => {
  let component: DraftAvailableIndicatorComponent;
  let fixture: ComponentFixture<DraftAvailableIndicatorComponent>;

  const mockedDialogService = mock(DialogService);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DraftAvailableIndicatorComponent],
      providers: [{ provide: DialogService, useValue: mockedDialogService }]
    }).compileComponents();

    fixture = TestBed.createComponent(DraftAvailableIndicatorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
