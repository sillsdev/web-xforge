import { TranslocoService } from '@ngneat/transloco';
import { firstValueFrom } from 'rxjs';

/**
 * Factory function for APP_INITIALIZER to preload English translations.
 * This ensures that English translations are available before the application fully initializes,
 * which is crucial for interceptors or services that rely on them early in the lifecycle.
 * @param translocoService The Transloco service for loading translations.
 * @returns A function that returns a Promise which resolves when English translations are loaded.
 */
export function preloadEnglishTranslations(translocoService: TranslocoService): () => Promise<any> {
  return () => firstValueFrom(translocoService.load('en'));
}
