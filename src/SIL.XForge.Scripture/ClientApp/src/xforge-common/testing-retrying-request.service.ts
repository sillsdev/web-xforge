import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ConsoleInterface } from './browser-globals';
import { FetchOptions, JsonRpcInvocable, RetryingRequest } from './retrying-request.service';

/**
 * Utility class for testing components that use the RetryingRequestService
 */
export class TestingRetryingRequestService {
  static createRequest<T>(
    invoke: Observable<T>,
    online: Observable<boolean> = new BehaviorSubject(true),
    cancel$ = new Subject<void>()
  ): RetryingRequest<T> {
    const invocable = {
      onlineInvoke: (_url: string, _method: string, _params: string) => invoke.toPromise()
    } as JsonRpcInvocable;
    const mockConsole = { log: () => {}, error: () => {} } as ConsoleInterface;
    return new RetryingRequest<T>(invocable, online, cancel$, {} as FetchOptions, mockConsole);
  }
}
