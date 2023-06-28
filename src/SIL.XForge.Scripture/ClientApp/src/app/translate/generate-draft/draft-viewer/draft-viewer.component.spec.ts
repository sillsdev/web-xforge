import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { HttpClient } from 'src/app/machine-api/http-client';
import { mock } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { DraftViewerComponent } from './draft-viewer.component';

const mockedHttpClient = mock(HttpClient);
const mockedActivatedProjectService = mock(ActivatedProjectService);
const mockedSFProjectService = mock(SFProjectService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedI18nService = mock(I18nService);

describe('DraftViewerComponent', () => {
  let component: DraftViewerComponent;
  let fixture: ComponentFixture<DraftViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DraftViewerComponent],
      providers: [
        { provide: HttpClient, useValue: mockedHttpClient },
        { provide: ActivatedProjectService, useValue: mockedActivatedProjectService },
        { provide: SFProjectService, useValue: mockedSFProjectService },
        { provide: ActivatedRoute, useValue: mockedActivatedRoute },
        { provide: I18nService, useValue: mockedI18nService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DraftViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
