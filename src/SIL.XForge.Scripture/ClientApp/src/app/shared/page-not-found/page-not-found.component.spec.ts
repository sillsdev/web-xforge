import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatIcon } from '@angular/material/icon';
import { MatProgressBar } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, UrlTree } from '@angular/router';
import { anything, mock, strictEqual, verify, when } from 'ts-mockito';
import { configureTestingModule, getTestTranslocoModule } from 'xforge-common/test-utils';
import { PageNotFoundComponent } from './page-not-found.component';

const mockedRouter = mock(Router);
const mockedActivatedRoute = mock(ActivatedRoute);

describe('PageNotFoundComponent', () => {
  configureTestingModule(() => {
    // Return a simple UrlTree-like object
    when(mockedRouter.createUrlTree(anything(), anything())).thenReturn({
      toString: () => '/projects'
    } as UrlTree);

    return {
      imports: [PageNotFoundComponent, getTestTranslocoModule(), MatIcon, MatProgressBar, PageNotFoundHostComponent],
      providers: [
        { provide: Router, useMock: mockedRouter },
        { provide: ActivatedRoute, useMock: mockedActivatedRoute }
      ]
    };
  });

  it('should redirect after ten seconds', fakeAsync(() => {
    new TestEnvironment();
    tick(9.9 * 1000);
    verify(mockedRouter.navigateByUrl(anything())).never();
    tick(0.2 * 1000);
    verify(mockedRouter.navigateByUrl(strictEqual('/projects'))).once();
    expect().nothing();
  }));
});

@Component({
  template: `<app-page-not-found></app-page-not-found>`,
  imports: [PageNotFoundComponent]
})
class PageNotFoundHostComponent {
  @ViewChild(PageNotFoundComponent) pageNotFoundComponent!: PageNotFoundComponent;
}

class TestEnvironment {
  readonly fixture: ComponentFixture<PageNotFoundHostComponent>;
  readonly hostComponent: PageNotFoundHostComponent;
  readonly component: PageNotFoundComponent;

  constructor() {
    this.fixture = TestBed.createComponent(PageNotFoundHostComponent);
    this.fixture.detectChanges();
    this.hostComponent = this.fixture.componentInstance;
    this.component = this.hostComponent.pageNotFoundComponent;

    this.fixture.detectChanges();
    tick();
  }
}
