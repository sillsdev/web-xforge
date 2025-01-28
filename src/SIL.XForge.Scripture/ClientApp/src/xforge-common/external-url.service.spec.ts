import { ExternalUrlService } from './external-url.service';

function stubbedI18nService(helpUrlPortion: string): any {
  return { locale: { helps: helpUrlPortion } };
}

describe('ExternalUrlService', () => {
  it('should provide the help URL for English', () => {
    const service = new ExternalUrlService(stubbedI18nService(''));
    expect(service.helps).toEqual('https://github-action-preview--scriptureforgehelp.netlify.app');
  });

  it('should provide the localized help URL', () => {
    const service = new ExternalUrlService(stubbedI18nService('es'));
    expect(service.helps).toEqual('https://github-action-preview--scriptureforgehelp.netlify.app/es');
  });

  it('should provide the manual URL for English', () => {
    const service = new ExternalUrlService(stubbedI18nService(''));
    expect(service.manual).toEqual('https://github-action-preview--scriptureforgehelp.netlify.app/manual');
  });

  it('should provide the localized manual URL', () => {
    const service = new ExternalUrlService(stubbedI18nService('es'));
    expect(service.manual).toEqual('https://github-action-preview--scriptureforgehelp.netlify.app/es/manual');
  });
});
