import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import { mock, when } from 'ts-mockito';

/**
 * Provides a mocked Navigator (defaults to online).
 */
export function provideTestOnlineStatus(): EnvironmentProviders {
  const mockedNavigator = mock(Navigator);
  when(mockedNavigator.onLine).thenReturn(true);
  return makeEnvironmentProviders([
    provideHttpClient(withInterceptorsFromDi()),
    provideHttpClientTesting(),
    { provide: Navigator, useValue: mockedNavigator }
  ]);
}
