import { Inject, Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { CONSOLE, ConsoleInterface } from './browser-globals';
import { CommandErrorCode, CommandService } from './command.service';
import { PwaService } from './pwa.service';

export interface JsonRpcInvocable {
  onlineInvoke<T>(url: string, method: string, params: any): Promise<T | undefined>;
}

export interface FetchOptions {
  url: string;
  method: string;
  params: any;
}

@Injectable({
  providedIn: 'root'
})
export class RetryingRequestService {
  constructor(
    private readonly pwaService: PwaService,
    private readonly commandService: CommandService,
    @Inject(CONSOLE) private readonly console: ConsoleInterface
  ) {}

  /**
   * Creates a RetryingRequest.
   * @param fetchOptions The url, method, and params for the request.
   * @param cancel$ An Observable that should fire when the request is no longer needed, such as when the component that
   * sent the request is being destroyed.
   */
  invoke<T>(fetchOptions: FetchOptions, cancel$: Subject<void>): RetryingRequest<T> {
    return new RetryingRequest<T>(
      this.commandService,
      this.pwaService.onlineStatus,
      cancel$,
      fetchOptions,
      this.console
    );
  }
}

/**
 * Utility class for repeating a request until it is successful. Upon creating the RetryingRequest, if the user is
 * detected to be online, the request is immediately sent.
 */
export class RetryingRequest<T> {
  /**
   * Promise that will resolve with the result of the request, or reject if an error was returned by the server.
   * Does not throw on network errors.
   */
  promiseForResult: Promise<T | undefined>;
  /**
   * Result of the request. This will be undefined until the request has completed. If the network request is successful
   * but the server responds with an error, this will remain undefined.
   */
  result?: T;
  /**
   * The server's error response. This is initially undefined. If the network request is successful and the server
   * responds with an error, this will be set to that error.
   */
  error?: any;
  /**
   * The number of times the network request has failed. This is useful for indicating to the user how many network
   * attempts have been made.
   */
  failedAttempts = 0;
  /**
   * The status of the request. Possible values are:
   * offline: Requests are not being attempted because the user is believed to not have a working network connection.
   * trying: Requests are being actively made. As long as the user has a network connection and until a response is
   * successful the status will remain trying.
   * complete: The request has succeeded and is no longer being attempted. This does not indicate that the server's
   * response did not contain an error, only that a request was successfully made.
   * canceled: The request was canceled because the cancel Observable fired.
   */
  status: 'offline' | 'trying' | 'complete' | 'canceled' = 'trying';
  private canceled = false;
  static readonly retryMs = 3000;

  constructor(
    private readonly rpcService: JsonRpcInvocable,
    private readonly online$: Observable<boolean>,
    private readonly cancel$: Subject<void>,
    fetchOptions: FetchOptions,
    @Inject(CONSOLE) private readonly console: ConsoleInterface
  ) {
    this.cancel$.pipe(take(1)).subscribe(() => {
      this.canceled = true;
      this.status = 'canceled';
    });
    this.promiseForResult = this.invoke(fetchOptions);
  }

  private async invoke(options: FetchOptions): Promise<T | undefined> {
    while (!this.canceled && this.status !== 'complete') {
      const online = await this.online$.pipe(take(1)).toPromise();
      if (online !== true) {
        this.status = 'offline';
        await this.uponOnline();
      } else {
        this.status = 'trying';

        try {
          const result = await this.rpcService.onlineInvoke<T>(options.url, options.method, options.params);
          this.result = result;
          this.status = 'complete';
          return this.result;
        } catch (e) {
          if (!this.isNetworkError(e)) {
            this.error = e;
            this.status = 'complete';
            throw this.error;
          }
          this.console.error(e);
          this.failedAttempts++;
          await new Promise(resolve => setTimeout(resolve, RetryingRequest.retryMs));
        }
      }
    }
    return;
  }

  private async uponOnline(): Promise<void> {
    await this.online$
      .pipe(
        filter(isOnline => isOnline),
        take(1)
      )
      .toPromise();
  }

  private isNetworkError(error: unknown): boolean {
    return typeof error === 'object' && error?.['code'] === CommandErrorCode.Other;
  }
}
