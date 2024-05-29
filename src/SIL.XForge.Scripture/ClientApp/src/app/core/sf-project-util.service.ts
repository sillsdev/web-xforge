import { Injectable } from '@angular/core';

/** Length of paratext ids for DBL resources. */
export const RESOURCE_IDENTIFIER_LENGTH = 16;

/**
 * SF project-related utilities. Pure functions wrapped in a class to make it easier to test.
 */
@Injectable({ providedIn: 'root' })
export class SFProjectUtilService {
  /**
   * Determines if a Paratext id refers to a resource.
   * @param paratextId The Paratext identifier.
   * @returns True if the Paratext identifier is a resource identifier.
   */
  isResource(paratextId: string): boolean {
    return paratextId.length === RESOURCE_IDENTIFIER_LENGTH;
  }
}
