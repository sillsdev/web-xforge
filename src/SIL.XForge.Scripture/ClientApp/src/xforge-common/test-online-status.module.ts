import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ModuleWithProviders, NgModule } from '@angular/core';
import { mock, when } from 'ts-mockito';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

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
