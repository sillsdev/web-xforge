import crypto from 'node:crypto';
import { state } from '../state.js';
import type { MockResource } from '../types.js';

export interface CreateResourceSpec {
  name: string;
  fullname?: string;
  id?: string;
  revision?: number;
  languageCode?: string;
  languageLDMLId?: string;
  languageName?: string;
  permittedUsers?: string[];
  /** USFM book codes with canned templates to include in the .p8z. */
  templateBooks?: string[];
}

/**
 * Creates a DBL resource and builds its .p8z fixture.
 * The p8z builder lives in ../dbl/p8z.js; this indirection keeps ops importable before the
 * DBL module is loaded.
 */
export async function createResource(spec: CreateResourceSpec): Promise<MockResource> {
  const { buildP8z } = await import('../dbl/p8z.js');
  const id = spec.id ?? crypto.randomBytes(8).toString('hex');
  if (state.resources.has(id)) throw new Error(`resource ${id} already exists`);
  const resource: MockResource = {
    id,
    revision: spec.revision ?? 1,
    name: spec.name,
    fullname: spec.fullname ?? spec.name,
    languageCode: spec.languageCode ?? 'eng',
    languageLDMLId: spec.languageLDMLId ?? 'en',
    languageName: spec.languageName ?? 'English',
    permittedUsers: spec.permittedUsers,
    p8zPath: ''
  };
  resource.p8zPath = await buildP8z(resource, spec.templateBooks ?? ['RUT']);
  state.resources.set(id, resource);
  state.save();
  return resource;
}
