import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { v1 as uuidv1 } from 'uuid';
import { hasNumberProp, hasObjectProp, hasStringProp } from '../type-utils';
import { BugsnagService } from './bugsnag.service';
import { COMMAND_API_NAMESPACE } from './url-constants';

/** See also C# enum EdjCase.JsonRpc.Common.RpcErrorCode, which this somewhat matches. */
export enum CommandErrorCode {
  Other = -32800,
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  Forbidden = -32000,
  NotFound = -32001
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: any;
  id?: string;
}

export interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  result?: T;
  error?: JsonRpcError;
  id: string;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

export class CommandError extends Error {
  constructor(public readonly code: CommandErrorCode, message: string, public readonly data?: unknown) {
    super(message);
    // this restores the prototype chain, so that the class can properly inherit from the built-in Error class
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * This service is used to invoke JSON-RPC commands.
 *
 * @example commandService.onlineInvoke(url, 'method', { param1: 'value1', param2: 'value2' });
 */
@Injectable({
  providedIn: 'root'
})
export class CommandService {
  constructor(private readonly http: HttpClient, private readonly bugsnagService: BugsnagService) {}

  async onlineInvoke<T>(url: string, method: string, params: any = {}): Promise<T | undefined> {
    url = `${COMMAND_API_NAMESPACE}/${url}`;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: uuidv1()
    };
    this.bugsnagService.leaveBreadcrumb(
      'JSON-RPC',
      {
        request: url,
        method: method,
        id: request.id,
        params: params
      },
      'request'
    );
    try {
      const response = await this.http
        .post<JsonRpcResponse<T>>(url, request, { headers: { 'Content-Type': 'application/json' } })
        .toPromise();
      if (response.error != null) {
        throw response.error;
      }
      return response.result;
    } catch (error) {
      // Transform the various kinds of errors into a CommandError.

      let code: CommandErrorCode = CommandErrorCode.Other;
      let moreInformation: string;
      let data: unknown;
      if (hasObjectProp(error, 'error') && error.error instanceof ErrorEvent) {
        const errorEvent: ErrorEvent = error.error;
        moreInformation = `${errorEvent.type}: ${errorEvent.message}`;
      } else if (error instanceof HttpErrorResponse) {
        // Only set code to HTTP status code if it is a CommandErrorCode.
        if (Object.values(CommandErrorCode).includes(error.status)) {
          code = error.status as CommandErrorCode;
        }
        moreInformation = error.message;
      } else if (
        // Does error implement interface JsonRpcError by having these properties?
        hasNumberProp(error, 'code') &&
        hasStringProp(error, 'message')
      ) {
        // Note that we might not be using errors that implement JsonRpcError anymore. But if we do receive one:
        const jsonRpcError: JsonRpcError = error;
        moreInformation = jsonRpcError.message;
        data = jsonRpcError.data;
        code = jsonRpcError.code;
      } else {
        moreInformation = `Unexpected error type: ${error}`;
      }
      const message = `Error invoking ${method}: ${moreInformation}`;
      throw new CommandError(code, message, data);
    }
  }
}
