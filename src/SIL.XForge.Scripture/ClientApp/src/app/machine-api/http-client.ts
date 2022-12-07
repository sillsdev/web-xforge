import { HttpClient as AngularHttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export const MACHINE_API_BASE_URL = 'machine-api/';

export interface HttpResponse<T> {
  status: number;
  data?: T;
}

@Injectable({
  providedIn: 'root'
})
export class HttpClient {
  constructor(private readonly httpClient: AngularHttpClient) {}

  get<T>(url: string): Observable<HttpResponse<T>> {
    return this.httpClient
      .get<T>(MACHINE_API_BASE_URL + url, { headers: this.getHeaders(), observe: 'response' })
      .pipe(map(r => ({ status: r.status, data: r.body == null ? undefined : r.body })));
  }

  post<T>(url: string, body?: any): Observable<HttpResponse<T>> {
    return this.httpClient
      .post<T>(MACHINE_API_BASE_URL + url, body, { headers: this.getHeaders(), observe: 'response' })
      .pipe(map(r => ({ status: r.status, data: r.body == null ? undefined : r.body })));
  }

  protected getHeaders(): any {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    };
  }
}
