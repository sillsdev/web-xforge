import { HttpClient, HttpResponse } from '@angular/common/http';
import { ANONYMOUS_URL } from 'xforge-common/url-constants';
import { Injectable } from '@angular/core';
import { AnonymousShareKeyResponse } from '../app/join/join.component';

@Injectable({
  providedIn: 'root'
})
export class AnonymousService {
  constructor(private readonly http: HttpClient) {}

  async checkShareKey(shareKey: string): Promise<AnonymousShareKeyResponse> {
    const formData = new FormData();
    formData.append('shareKey', shareKey);
    const response = await this.post<AnonymousShareKeyResponse>('checkShareKey', formData);
    return response.body!;
  }

  async generateAccount(shareKey: string, displayName: string, localeCode: string): Promise<boolean> {
    const formData = new FormData();
    formData.append('shareKey', shareKey);
    formData.append('displayName', displayName);
    formData.append('language', localeCode);
    const response = await this.post<boolean>('generateAccount', formData);
    return response.body!;
  }

  private post<T>(endPoint: string, body?: any): Promise<HttpResponse<T>> {
    const url: string = `${ANONYMOUS_URL}/${endPoint}`;
    return this.http
      .post<T>(url, body, {
        headers: { Accept: 'application/json' },
        responseType: 'json',
        observe: 'response'
      })
      .toPromise();
  }
}
