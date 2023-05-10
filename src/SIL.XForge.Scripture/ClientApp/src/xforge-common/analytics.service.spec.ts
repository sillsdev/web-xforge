import { sanitizeUrl } from './analytics.service';

describe('AnalyticsService', () => {
  it('should redact the access token from URL', () => {
    const url = 'https://example.com/#access_token=123';
    expect(sanitizeUrl(url)).toEqual('https://example.com/#access_token=redacted');
  });

  it('should redact the join key from URL', () => {
    const url = 'https://example.com/join/123';
    expect(sanitizeUrl(url)).toEqual('https://example.com/join/redacted');
  });
});
