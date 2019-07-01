import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { ErrorComponent } from './error.component';

describe('ErrorComponent', () => {
  it('should display error page', () => {
    const env = new TestEnvironment();
    expect(env.errorCode.textContent).toBe('Error: 404: Not found');

    expect(env.stackTrace).toBeNull();
    env.clickForDetailsText.click();
    env.fixture.detectChanges();
    expect(env.stackTrace).not.toBeNull();
    expect(env.stackTrace.textContent).toBe('Some made up component');

    env.clickForDetailsText.click();
    env.fixture.detectChanges();
    expect(env.stackTrace).toBeNull();
  });
});

class TestEnvironment {
  fixture: ComponentFixture<ErrorComponent>;
  component: ErrorComponent;

  mockedActivatedRoute: ActivatedRoute = mock(ActivatedRoute);
  mockedNoticeService: NoticeService = mock(NoticeService);

  constructor() {
    when(this.mockedActivatedRoute.queryParams).thenReturn(
      of({ stack: 'Some made up component', errorCode: 'Error: 404: Not found' })
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) }
      ],
      declarations: [ErrorComponent]
    });
    this.fixture = TestBed.createComponent(ErrorComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }

  get errorCode(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#error-code');
  }

  get clickForDetailsText(): HTMLElement {
    return this.fixture.nativeElement.querySelector('span a');
  }

  get stackTrace(): HTMLElement {
    return this.fixture.nativeElement.querySelector('pre');
  }
}
