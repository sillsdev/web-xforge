import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import uuidv1 from 'uuid/v1';

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

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

/**
 * This service is used to invoke JSON-RPC commands.
 *
 * @example commandService.onlineInvoke(type, 'method', { param1: 'value1', param2: 'value2' });
 */
@Injectable({
  providedIn: 'root'
})
export class CommandService {
  constructor(private readonly http: HttpClient) {}

  async onlineInvoke<T>(type: string, method: string, params: any = {}): Promise<T> {
    const url = `command-api/${type}`;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id: uuidv1()
    };
    const response = await this.http
      .post<JsonRpcResponse<T>>(url, request, { headers: { 'Content-Type': 'application/json' } })
      .toPromise();
    if (response.error != null) {
      throw response.error;
    }
    return response.result;
  }
}
