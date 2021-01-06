import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { anything, spy, strictEqual, verify } from 'ts-mockito';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { PageNotFoundComponent } from './page-not-found.component';

describe('PageNotFoundComponent', () => {
  configureTestingModule(() => ({
    imports: [
      TestTranslocoModule,
      UICommonModule,
      // Set the redirect to PageNotFoundComponent just because it has to be set to some component
      RouterTestingModule.withRoutes([{ path: 'projects', component: PageNotFoundComponent }])
    ],
    declarations: [PageNotFoundComponent, PageNotFoundHostComponent]
  }));

  it('should redirect after ten seconds', fakeAsync(() => {
    const env = new TestEnvironment();
    tick(9.9 * 1000);
    verify(env.routerSpy.navigateByUrl(anything())).never();
    tick(0.2 * 1000);
    verify(env.routerSpy.navigateByUrl(strictEqual('/projects'))).once();
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
  readonly routerSpy: Router;

  constructor() {
    this.fixture = TestBed.createComponent(PageNotFoundHostComponent);
    this.fixture.detectChanges();
    this.hostComponent = this.fixture.componentInstance;
    this.component = this.hostComponent.pageNotFoundComponent;
    this.routerSpy = spy(this.component.router);

    this.fixture.detectChanges();
    tick();
  }
}
