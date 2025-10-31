import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { QuillFormatRegistryService } from './quill-format-registry.service';
import { registerScriptureFormats } from './quill-registrations';

/**
 * Provides app initialization registering of custom Quill formats.
 */
export function provideQuillRegistrations(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const formatRegistry = inject(QuillFormatRegistryService);
    registerScriptureFormats(formatRegistry);
  });
}
