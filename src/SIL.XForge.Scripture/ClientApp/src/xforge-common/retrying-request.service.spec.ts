import { fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject, Observable, of, Subject, throwError } from 'rxjs';
import { CommandErrorCode } from './command.service';
import { RetryingRequest } from './retrying-request.service';
import { TestingRetryingRequestService } from './testing-retrying-request.service';

const TEST_NETWORK_ERROR = new Error('Test network error');
TEST_NETWORK_ERROR['code'] = CommandErrorCode.Other;

const TEST_NON_NETWORK_ERROR = new Error('Test non-network error');

const RETRY_DELAY = RetryingRequest.retryMs;
const NEGLIGIBLE_AMOUNT_OF_TIME = 10;

describe('RetryingRequest', () => {
  it('makes requests', async () => {
    const request = TestingRetryingRequestService.createRequest(of('response'));

    expect(request.result).toBeUndefined();
    expect(request.error).toBeUndefined();
    expect(request.status).toBe('trying');
    expect(request.failedAttempts).toBe(0);

    expect(await request.promiseForResult).toBe('response');
    expect(request.result).toBe('response');
    expect(request.error).toBeUndefined();
    expect(request.status).toBe('complete');
    expect(request.failedAttempts).toBe(0);
  });

  it('waits for the user to be online before sending requests', fakeAsync(() => {
    const online$ = new BehaviorSubject(false);
    const request = TestingRetryingRequestService.createRequest(of('response'), online$);

    tick();
    expect(request.result).toBeUndefined();
    expect(request.error).toBeUndefined();
    expect(request.status).toBe('offline');
    expect(request.failedAttempts).toBe(0);

    online$.next(true);
    tick();

    expect(request.result).toBe('response');
    expect(request.error).toBeUndefined();
    expect(request.status).toBe('complete');
    expect(request.failedAttempts).toBe(0);
  }));

  it('catches network errors and retries but stops trying when the user is offline', fakeAsync(() => {
    let networkErrors = true;
    const online$ = new BehaviorSubject(true);
    const observable = new Observable(subscriber => {
      if (networkErrors) {
        subscriber.error(TEST_NETWORK_ERROR);
      } else {
        subscriber.next('response');
        subscriber.complete();
      }
    });
    const request = TestingRetryingRequestService.createRequest(observable, online$);

    tick();
    expect(request.failedAttempts).toBe(1);
    expect(request.status).toBe('trying');
    expect(request.result).toBeUndefined();

    tick(RETRY_DELAY + NEGLIGIBLE_AMOUNT_OF_TIME);
    expect(request.failedAttempts).toBe(2);
    expect(request.status).toBe('trying');
    expect(request.result).toBeUndefined();

    online$.next(false);
    tick(RETRY_DELAY + NEGLIGIBLE_AMOUNT_OF_TIME);
    expect(request.failedAttempts).toBe(2);
    expect(request.status).toBe('offline');
    expect(request.result).toBeUndefined();

    networkErrors = false;
    online$.next(true);
    tick(RETRY_DELAY + NEGLIGIBLE_AMOUNT_OF_TIME);
    expect(request.failedAttempts).toBe(2);
    expect(request.status).toBe('complete');
    expect(request.result).toBe('response');
  }));

  it('handles non-network errors', fakeAsync(() => {
    const online$ = new BehaviorSubject(true);
    const request = TestingRetryingRequestService.createRequest(throwError(TEST_NON_NETWORK_ERROR), online$);

    let rejectedWithError: any;
    request.promiseForResult.catch(error => (rejectedWithError = error));

    tick();
    expect(request.failedAttempts).toBe(0);
    expect(request.status).toBe('complete');
    expect(request.result).toBeUndefined();
    expect(request.error).toEqual(TEST_NON_NETWORK_ERROR);
    expect(rejectedWithError).toEqual(TEST_NON_NETWORK_ERROR);
  }));

  it('allows canceling the request', fakeAsync(() => {
    const online$ = new BehaviorSubject(true);
    const cancel$ = new Subject<void>();
    const request = TestingRetryingRequestService.createRequest(throwError(TEST_NETWORK_ERROR), online$, cancel$);

    let rejectedWithError: any;
    request.promiseForResult.catch(error => (rejectedWithError = error));

    tick();
    expect(request.failedAttempts).toBe(1);
    expect(request.status).toBe('trying');
    expect(request.result).toBeUndefined();
    expect(request.error).toBeUndefined();
    expect(rejectedWithError).toBeUndefined();

    tick(RETRY_DELAY - NEGLIGIBLE_AMOUNT_OF_TIME);
    expect(request.failedAttempts).toBe(1);

    cancel$.next();
    tick(RETRY_DELAY * 10);
    expect(request.failedAttempts).toBe(1);
    expect(request.status).toBe('canceled');
    expect(request.result).toBeUndefined();
    expect(request.error).toBeUndefined();
  }));
});
