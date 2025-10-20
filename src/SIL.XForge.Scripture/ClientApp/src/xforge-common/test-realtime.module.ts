import { Provider } from '@angular/core';
import { FileService } from './file.service';
import { MemoryOfflineStore } from './memory-offline-store';
import { MemoryRealtimeRemoteStore } from './memory-realtime-remote-store';
import { OfflineStore } from './offline-store';
import { RealtimeRemoteStore } from './realtime-remote-store';
import { RealtimeService } from './realtime.service';
import { TestRealtimeService } from './test-realtime.service';
import { TypeRegistry } from './type-registry';

/**
 * Provides test doubles for realtime services using in-memory stores.
 */
export function provideTestRealtime(typeRegistry: TypeRegistry): Provider[] {
  return [
    { provide: TypeRegistry, useValue: typeRegistry },
    { provide: RealtimeRemoteStore, useClass: MemoryRealtimeRemoteStore },
    { provide: OfflineStore, useClass: MemoryOfflineStore },
    { provide: TestRealtimeService, useClass: TestRealtimeService },
    { provide: RealtimeService, useExisting: TestRealtimeService },
    { provide: FileService, useValue: undefined }
  ];
}
