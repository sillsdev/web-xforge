import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient } from 'src/app/machine-api/http-client';
import { mock } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { GenerateDraftComponent } from './generate-draft.component';

const mockedHttpClient = mock(HttpClient);
const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedDialogService = mock(DialogService);

describe('GenerateDraftComponent', () => {
  let component: GenerateDraftComponent;
  let fixture: ComponentFixture<GenerateDraftComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GenerateDraftComponent],
      providers: [
        { provide: HttpClient, useValue: mockedHttpClient },
        { provide: ActivatedProjectService, useValue: mockedActivatedProjectService },
        { provide: DialogService, useValue: mockedDialogService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GenerateDraftComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
