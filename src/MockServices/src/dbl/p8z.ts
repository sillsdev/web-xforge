/**
 * Builds .p8z fixtures for the mock DBL adapter.
 *
 * Provenance (structure of a valid .p8z):
 *   - .dbl/id/<hexid>             — file whose NAME is the 16-char hex id (ParatextData decompile:
 *                                    ZippedProjectFileManagerBase.DBLSettings.GetIdAndCheck)
 *   - .dbl/revision/<N>           — file whose NAME is the integer revision
 *   - .dbl/permissions-checksum/<value>   — file whose NAME is the checksum string
 *   - .dbl/p8z-manifest-checksum/<value>  — file whose NAME is the checksum string
 *     (all four are required by DBLSettingsIntegrityCheck; values are cross-checked against the
 *     JSON list response by IsNewerThanCurrentlyInstalledInternal — must match exactly)
 *   - .dbl/language/iso/<iso>     — lazy-loaded; not checked by integrity check but good practice
 *   - Settings.xml                — loaded by ScrText; must have Type=Resource or Paratext treats
 *                                    it as a regular project
 *   - <bookNumber><bookCode>.SFM  — USFM book files (41MAT naming)
 *   (usfm.sty / .ldml are loaded lazily from the global settings dir if absent; omitting is safe)
 *
 * Checksum values: we use stable dummies derived from id+revision. SF's
 * IsNewerThanCurrentlyInstalledInternal compares them against the installed copy — since the mock
 * always rebuilds the p8z with the same spec they will match on re-check. No cryptographic
 * requirement exists (ParatextData never hashes the file and compares — empirical + decompile).
 */

import AdmZip from 'adm-zip';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { RESOURCES_DIR } from '../config.js';
import { BOOK_TEMPLATES, resourceBookFileName } from '../templates.js';
import type { MockResource } from '../types.js';

/** Stable dummy checksum derived from resource id + suffix. Not a real hash of the file. */
function dummyChecksum(id: string, suffix: string): string {
  return crypto.createHash('md5').update(`${id}-${suffix}`).digest('hex');
}

/** Resource-specific Settings.xml. Type=Resource is what distinguishes a DBL resource from a
 *  regular project in ParatextData (empirical + code inspection of ResourceProjectSettings). */
function resourceSettingsXml(resource: MockResource): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<ScriptureText>
  <Name>${resource.name}</Name>
  <FullName>${resource.fullname}</FullName>
  <Guid>${resource.id}</Guid>
  <DBLId>${resource.id}</DBLId>
  <Language>${resource.languageName}</Language>
  <LanguageIsoCode>${resource.languageCode}:::</LanguageIsoCode>
  <Encoding>65001</Encoding>
  <DefaultFont>Charis SIL</DefaultFont>
  <DefaultFontSize>12</DefaultFontSize>
  <Naming PrePart="" PostPart=".SFM" BookNameForm="41MAT" />
  <FileNamePrePart />
  <FileNameBookNameForm>41MAT</FileNameBookNameForm>
  <FileNamePostPart>.SFM</FileNamePostPart>
  <Type>Resource</Type>
  <Copyright>© Mock Scripture — not for distribution</Copyright>
  <Versification>4</Versification>
  <MinParatextVersion>8.0.100.76</MinParatextVersion>
  <IsResource>true</IsResource>
</ScriptureText>
`;
}

/**
 * Builds a .p8z zip for the given resource, writing it to RESOURCES_DIR/<id>.p8z.
 * Returns the absolute path to the file.
 *
 * templateBooks: array of USFM book codes (keys of BOOK_TEMPLATES). Unknown codes are skipped
 * with a warning.
 */
export async function buildP8z(resource: MockResource, templateBooks: string[]): Promise<string> {
  fs.mkdirSync(RESOURCES_DIR, { recursive: true });

  const zip = new AdmZip();

  // --- .dbl metadata entries ---
  // Each entry in a .dbl/<setting>/ folder is a *zero-byte* file whose NAME encodes the value.
  // (Confirmed from decompile: GetDBLFileNameSetting returns Path.GetFileName of the first file
  // found in that folder, ordered by last-write time.)
  const permChecksum = dummyChecksum(resource.id, 'permissions-checksum');
  const manifestChecksum = dummyChecksum(resource.id, 'p8z-manifest-checksum');

  zip.addFile(`.dbl/id/${resource.id}`, Buffer.alloc(0));
  zip.addFile(`.dbl/revision/${resource.revision}`, Buffer.alloc(0));
  zip.addFile(`.dbl/permissions-checksum/${permChecksum}`, Buffer.alloc(0));
  zip.addFile(`.dbl/p8z-manifest-checksum/${manifestChecksum}`, Buffer.alloc(0));
  zip.addFile(`.dbl/language/iso/${resource.languageCode}`, Buffer.alloc(0));

  // .dbl/names — optional JSON blob used by DBLSettings constructor to read resource_fullname
  const namesJson = JSON.stringify({
    resource_fullname: resource.fullname,
    nameCommon: resource.name
  });
  zip.addFile('.dbl/names', Buffer.from(namesJson, 'utf8'));

  // --- Settings.xml ---
  zip.addFile('Settings.xml', Buffer.from(resourceSettingsXml(resource), 'utf8'));

  // --- USFM book files ---
  for (const bookCode of templateBooks) {
    const tmpl = BOOK_TEMPLATES[bookCode];
    if (tmpl === undefined) {
      console.warn(`[mock/p8z] unknown book code ${bookCode} — skipping`);
      continue;
    }
    zip.addFile(resourceBookFileName(bookCode), Buffer.from(tmpl.usfm, 'utf8'));
  }

  const outPath = path.join(RESOURCES_DIR, `${resource.id}.p8z`);
  await new Promise<void>((resolve, reject) => {
    zip.writeZip(outPath, err => (err ? reject(err) : resolve()));
  });

  return outPath;
}

/** Returns the checksums that were embedded in the .p8z for this resource, for use in the list
 *  response. The values must exactly match what is inside the zip. */
export function checksums(resource: MockResource): { permissionsChecksum: string; manifestChecksum: string } {
  return {
    permissionsChecksum: dummyChecksum(resource.id, 'permissions-checksum'),
    manifestChecksum: dummyChecksum(resource.id, 'p8z-manifest-checksum')
  };
}
