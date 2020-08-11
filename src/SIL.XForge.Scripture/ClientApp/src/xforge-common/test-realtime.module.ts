import { ModuleWithProviders, NgModule } from '@angular/core';
import { FileService } from './file.service';
import { MemoryOfflineStore } from './memory-offline-store';
import { MemoryRealtimeRemoteStore } from './memory-realtime-remote-store';
import { OfflineStore } from './offline-store';
import { PwaService } from './pwa.service';
import { RealtimeRemoteStore } from './realtime-remote-store';
import { RealtimeService } from './realtime.service';
import { TestRealtimeService } from './test-realtime.service';
import { TypeRegistry } from './type-registry';

@NgModule()
export class TestRealtimeModule {
  static forRoot(typeRegistry: TypeRegistry): ModuleWithProviders<TestRealtimeModule> {
    return {
      ngModule: TestRealtimeModule,
      providers: [
        { provide: TypeRegistry, useValue: typeRegistry },
        { provide: RealtimeRemoteStore, useClass: MemoryRealtimeRemoteStore },
        { provide: OfflineStore, useClass: MemoryOfflineStore },
        { provide: TestRealtimeService, useClass: TestRealtimeService },
        { provide: RealtimeService, useExisting: TestRealtimeService },
        { provide: FileService, useValue: undefined },
        { provide: PwaService, useValue: undefined }
      ]
    };
  }
}
