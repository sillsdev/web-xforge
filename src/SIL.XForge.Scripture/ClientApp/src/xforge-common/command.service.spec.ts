import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { mock } from 'ts-mockito';
import { BugsnagService } from './bugsnag.service';
import { CommandError, CommandErrorCode, CommandService, JsonRpcError, JsonRpcResponse } from './command.service';
import { configureTestingModule } from './test-utils';

const mockedBugsnagService = mock(BugsnagService);

describe('CommandService', () => {
  configureTestingModule(() => ({
    imports: [HttpClientTestingModule],
    providers: [{ provide: BugsnagService, useMock: mockedBugsnagService }]
  }));

  it('fetches', fakeAsync(() => {
    const env = new TestEnvironment();
    let result: string | undefined;

    // SUT
    env.service.onlineInvoke<string>('place1', 'someMethod').then((res: string | undefined) => {
      result = res;
    });
    tick();

    const request = env.httpMock.expectOne({ url: 'command-api/place1', method: 'POST' });
    const response: JsonRpcResponse<string> = {
      jsonrpc: '2.0',
      result: 'hi',
      error: undefined,
      id: '1'
    };
    request.flush(response);
    tick();

    expect(result).toEqual('hi');
    env.httpMock.verify();
  }));

  it('handles response with JsonRpcError', fakeAsync(() => {
    // A way to fail if the server provides a JsonRpcResponse with an JsonRpcError. This might have been the expected
    // error information format, but it's not clear that we actually use this anymore.

    const env = new TestEnvironment();

    // SUT
    env.service
      .onlineInvoke<string>('place1', 'someMethod')
      .then((_res: string | undefined) => {
        fail('should not have had a successful promise resolution');
      })
      .catch((errorInfo: any) => {
        // The SUT catch block shouldn't have itself crashed. It should have successfully made and thrown a
        // CommandError.
        expect(errorInfo).toBeInstanceOf(CommandError);
        const commandError: CommandError = errorInfo;

        expect(commandError.message).toMatch(/Error invoking someMethod:/);
        expect(commandError.message).toMatch(/no good/);
        expect(commandError.code).toEqual(CommandErrorCode.Forbidden);
        expect(commandError.data).toEqual('error data');
      });
    tick();

    const request = env.httpMock.expectOne({ url: 'command-api/place1', method: 'POST' });
    const errorResponse: JsonRpcError = { code: CommandErrorCode.Forbidden, message: 'no good', data: 'error data' };
    const response: JsonRpcResponse<string> = {
      jsonrpc: '2.0',
      result: 'hi',
      error: errorResponse,
      id: '1'
    };
    request.flush(response);
    tick();
    env.httpMock.verify();
  }));

  it('handles failure status', fakeAsync(() => {
    // A way to fail that just has an error status. Like an example at
    // https://angular.io/guide/http#testing-for-errors . We might get this kind of error when we have a programming
    // mistake in our application, for example, perhaps by calling an API at a very wrong address.

    const env = new TestEnvironment();

    // SUT
    env.service
      .onlineInvoke<string>('place1', 'someMethod')
      .then((_res: string | undefined) => {
        fail('should not have had a successful promise resolution');
      })
      .catch((errorInfo: any) => {
        // The SUT catch block shouldn't have itself crashed. It should have successfully made and thrown a
        // CommandError.
        expect(errorInfo).toBeInstanceOf(CommandError);
        const commandError: CommandError = errorInfo;

        expect(commandError.message).toMatch(/Error invoking someMethod:/);
        // Error message contains error status number and status text
        expect(commandError.message).toMatch(/404/);
        expect(commandError.message).toMatch(/can not find/);
        // The body of the response probably shouldn't be in the error message.
        expect(commandError.message).not.toMatch(/body of response/);
        // Command error code should not be set to a normal http status code like 404, since that is not a
        // CommandErrorCode.
        expect(commandError.code).toEqual(CommandErrorCode.Other);
        expect(commandError.data).toBeUndefined();
      });
    tick();

    const request = env.httpMock.expectOne({ url: 'command-api/place1', method: 'POST' });
    request.flush('body of response', { status: 404, statusText: 'can not find' });
    tick();
    env.httpMock.verify();
  }));

  it('handles CommandErrorCodes in HttpErrorResponse status', fakeAsync(() => {
    // Our backend RPC returns our custom error codes as HTTP status codes. Report these.

    const env = new TestEnvironment();

    // SUT
    env.service
      .onlineInvoke<string>('place1', 'someMethod')
      .then((_res: string | undefined) => {
        fail('should not have had a successful promise resolution');
      })
      .catch((errorInfo: any) => {
        // The SUT catch block shouldn't have itself crashed. It should have successfully made and thrown a
        // CommandError.
        expect(errorInfo).toBeInstanceOf(CommandError);
        const commandError: CommandError = errorInfo;

        expect(commandError.message).toMatch(/Error invoking someMethod:/);
        // Error message contains error status number and status text
        expect(commandError.message).toMatch(/-32000/);
        expect(commandError.message).toMatch(/can not find/);
        // The body of the response probably shouldn't be in the error message.
        expect(commandError.message).not.toMatch(/body of response/);
        // CommandError code property is set to http status code
        expect(commandError.code).toEqual(CommandErrorCode.Forbidden);
        expect(commandError.data).toBeUndefined();
      });
    tick();

    const request = env.httpMock.expectOne({ url: 'command-api/place1', method: 'POST' });
    request.flush('body of response', { status: CommandErrorCode.Forbidden, statusText: 'can not find' });
    tick();
    env.httpMock.verify();
  }));

  it('handles ErrorEvent', fakeAsync(() => {
    // A way to fail without actually reaching the server. Like an example at
    // https://angular.io/guide/http#testing-for-errors . This kind of error seems likely, as a result of networking
    // trouble. Though in testing, if http.post() happens when the Internet is off, there is an HttpErrorResponse with
    // status 0 and statusText "Unknown Error".

    const env = new TestEnvironment();

    // SUT
    env.service
      .onlineInvoke<string>('place1', 'someMethod')
      .then((_res: string | undefined) => {
        fail('should not have had a successful promise resolution');
      })
      .catch((errorInfo: any) => {
        // The SUT catch block shouldn't have itself crashed. It should have successfully made and thrown a
        // CommandError.
        expect(errorInfo).toBeInstanceOf(CommandError);
        const commandError: CommandError = errorInfo;

        // "Network problem" before Chromium 105, "Error invoking someMethod" works for Chromium 105
        expect(commandError.message).toMatch(
          /(?:Network problem|Error invoking someMethod: Http failure response for command-api\/place1)/
        );
        expect(commandError.code).toEqual(CommandErrorCode.Other);
        expect(commandError.data).toBeUndefined();
      });
    tick();

    const request = env.httpMock.expectOne({ url: 'command-api/place1', method: 'POST' });
    const errorResponse = new ProgressEvent('Network problem');
    request.error(errorResponse);
    tick();
    env.httpMock.verify();
  }));

  // It would be nice to have a test that gets down to the fall-thru condition of a type of error that didn't match
  // what we expected. But the HttpTestingController isn't letting a request.error() be done that is not an
  // ErrorEvent. And if we request.flush(jsonRpcResponse), the jsonRpcResponse.error must be a JsonRpcError.
});

class TestEnvironment {
  readonly service: CommandService;
  readonly httpMock: HttpTestingController;

  constructor() {
    this.service = TestBed.inject(CommandService);
    this.httpMock = TestBed.inject(HttpTestingController);
  }
}
