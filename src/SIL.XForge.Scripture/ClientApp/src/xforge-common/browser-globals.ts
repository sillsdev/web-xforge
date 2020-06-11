import { InjectionToken } from '@angular/core';

/**
 * Alias for the Console interface defined in globals.d.ts and lib.dom.d.ts. Using Console as a constructor's parameter
 * type results in `ReferenceError: Console is not defined` at run time. This is because a reference to Console is in
 * the output, as part of the constructor's metadata, despite Console not being defined in the browser.
 */
export type ConsoleInterface = Console;

/**
 * InjectionToken for window
 */
export const WINDOW = new InjectionToken<Window>('Window', {
  providedIn: 'root',
  factory: () => window
});

/**
 * InjectionToken for window.console
 */
export const CONSOLE = new InjectionToken<Console>('Console', {
  providedIn: 'root',
  factory: () => window.console
});

/**
 * InjectionToken for window.document.
 * Angular has its own DOCUMENT injection token, but if we use that token to mock the document in the tests, then
 * Angular won't be able to access the document. By using a separate injection token we can mock the document in our
 * code but Angular will still have the actual document.
 */
export const DOCUMENT = new InjectionToken<Document>('Document', {
  providedIn: 'root',
  factory: () => window.document
});

/**
 * InjectionToken for window.navigator
 */
export const NAVIGATOR = new InjectionToken<Navigator>('Navigator', {
  providedIn: 'root',
  factory: () => window.navigator
});
