import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ModuleWithProviders, NgModule } from '@angular/core';
import { mock, when } from 'ts-mockito';

@NgModule({ imports: [], providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()] })
export class TestOnlineStatusModule {
  static forRoot(): ModuleWithProviders<TestOnlineStatusModule> {
    const mockedNavigator = mock(Navigator);
    when(mockedNavigator.onLine).thenReturn(true);
    return {
      ngModule: TestOnlineStatusModule,
      providers: [{ provide: Navigator, useValue: mockedNavigator }]
    };
  }
}
