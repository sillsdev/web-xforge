import { HttpClient, HttpResponse } from '@angular/common/http';
import { ANONYMOUS_URL } from 'xforge-common/url-constants';
import { Injectable } from '@angular/core';
import { AnonymousShareKeyResponse } from '../app/join/join.component';

interface GenerateAccountRequest {
  shareKey: string;
  displayName: string;
  language: string;
}

@Injectable({
  providedIn: 'root'
})
export class AnonymousService {
  constructor(private readonly http: HttpClient) {}

  async checkShareKey(shareKey: string): Promise<AnonymousShareKeyResponse> {
    const response = await this.post<AnonymousShareKeyResponse>('checkShareKey', { shareKey });
    return response.body!;
  }

  async generateAccount(shareKey: string, displayName: string, language: string): Promise<boolean> {
    const body: GenerateAccountRequest = {
      shareKey,
      displayName,
      language
    };
    const response = await this.post<boolean>('generateAccount', body);
    return response.body!;
  }

  private post<T>(endPoint: string, body?: any): Promise<HttpResponse<T>> {
    const url: string = `${ANONYMOUS_URL}/${endPoint}`;
    return this.http
      .post<T>(url, body, {
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        responseType: 'json',
        observe: 'response'
      })
      .toPromise();
  }
}
