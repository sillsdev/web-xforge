import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { anything, mock, strictEqual, verify, when } from 'ts-mockito';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { PageNotFoundComponent } from './page-not-found.component';

const mockedRouter = mock(Router);

describe('PageNotFoundComponent', () => {
  configureTestingModule(() => ({
    imports: [TestTranslocoModule, RouterTestingModule, UICommonModule],
    declarations: [PageNotFoundComponent, PageNotFoundHostComponent],
    providers: [{ provide: Router, useMock: mockedRouter }]
  }));

  it('should redirect after ten seconds', fakeAsync(() => {
    const env = new TestEnvironment();
    tick(9.9 * 1000);
    verify(mockedRouter.navigateByUrl(anything())).never();
    tick(0.2 * 1000);
    verify(mockedRouter.navigateByUrl(strictEqual('/projects'))).once();
    expect().nothing();
  }));
});

@Component({
  template: `<app-page-not-found></app-page-not-found>`
})
class PageNotFoundHostComponent {
  @ViewChild(PageNotFoundComponent) pageNotFoundComponent!: PageNotFoundComponent;
}

class TestEnvironment {
  readonly fixture: ComponentFixture<PageNotFoundHostComponent>;
  readonly hostComponent: PageNotFoundHostComponent;
  readonly component: PageNotFoundComponent;

  constructor() {
    when(mockedRouter.createUrlTree(anything(), anything())).thenReturn('/projects' as any);
    this.fixture = TestBed.createComponent(PageNotFoundHostComponent);
    this.fixture.detectChanges();
    this.hostComponent = this.fixture.componentInstance;
    this.component = this.hostComponent.pageNotFoundComponent;

    this.fixture.detectChanges();
    tick();
  }
}
