import { TestBed, TestModuleMetadata } from '@angular/core/testing';
import { configureTestSuite } from 'ng-bullet';
import { instance, reset } from 'ts-mockito';

export const configureTestingModule = (createModuleDef: () => TestModuleMetadata) => {
  const mocks: any[] = [];

  configureTestSuite(() => {
    const moduleDef = createModuleDef();
    if (moduleDef.providers != null) {
      for (const provider of moduleDef.providers) {
        if (provider.useMock != null) {
          const mock = provider.useMock;
          provider.useFactory = () => instance(mock);
          delete provider.useMock;
          mocks.push(mock);
        }
      }
    }
    TestBed.configureTestingModule(moduleDef);
  });

  afterEach(() => {
    for (const mock of mocks) {
      reset(mock);
    }
  });
};
