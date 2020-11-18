import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import Bugsnag from '@bugsnag/js';
import uuidv1 from 'uuid/v1';
import { COMMAND_API_NAMESPACE } from './url-constants';

export enum CommandErrorCode {
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

interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  result?: T;
  error?: JsonRpcError;
  id: string;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

export class CommandError extends Error {
  constructor(public readonly code: CommandErrorCode, message: string, public readonly data?: any) {
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
  constructor(private readonly http: HttpClient) {}

  async onlineInvoke<T>(url: string, method: string, params: any = {}): Promise<T | undefined> {
    Bugsnag.leaveBreadcrumb(
      'JSON-RPC',
      {
        request: url,
        method: method,
        params: params
      },
      'request'
    );
    url = `${COMMAND_API_NAMESPACE}/${url}`;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: uuidv1()
    };
    try {
      const response = await this.http
        .post<JsonRpcResponse<T>>(url, request, { headers: { 'Content-Type': 'application/json' } })
        .toPromise();
      if (response.error != null) {
        throw response.error;
      }
      return response.result;
    } catch (error) {
      const message = `Error invoking ${method}: ${error.message}`;
      throw new CommandError(error.code, message, error.data);
    }
  }
}
