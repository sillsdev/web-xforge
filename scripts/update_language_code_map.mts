#!/usr/bin/env -S deno run --allow-net --allow-write

// This script fetches the ISO 639-3 language codes in TSV format and converts them to JSON format
// It then calculates the mapping of ISO 639-1 to ISO 639-3 codes, and the mapping of bibliographic to terminology codes.
// It does not handle ISO 639-2 codes for collections of languages, or deal with macrolanguages.

/**
 * Parses a TSV string into an array of objects, where each object represents a row in the TSV file.
 * @param tsv The TSV string to parse
 * @param expectedHeaders The headers that are expected to be present in the TSV file. If any of these headers are
 * missing, an error will be thrown. These headers become the keys in the resulting objects.
 * @returns An array of objects, where each object represents a row in the TSV file.
 */
function parseTsvToObjects(tsv: string, expectedHeaders: readonly string[]): { [key: string]: string }[] {
  const lines = tsv.trim().split("\n");
  const rows = lines.map(line => line.split("\t"));

  const header = rows[0];
  const missingHeaders = expectedHeaders.filter(expectedHeader => !header.includes(expectedHeader));
  if (missingHeaders.length > 0) {
    throw new Error(
      `The file includes the following headers: ${header.join(
        ", "
      )} and is missing the following required headers: ${missingHeaders.join(", ")}`
    );
  }

  const entries: { [key: string]: string }[] = [];

  for (const row of rows.slice(1)) {
    const entry: { [key: string]: string } = {};
    for (const [index, field] of Object.entries(header)) {
      const value = row[Number.parseInt(index, 10)];
      if (value) entry[field] = value;
    }
    entries.push(entry);
  }

  return entries;
}

const fileHeaders = ["Id", "Part2b", "Part2t", "Part1", "Scope", "Language_Type", "Ref_Name", "Comment"] as const;
type FileHeader = (typeof fileHeaders)[number];

const isoFileUrl = "https://iso639-3.sil.org/sites/iso639-3/files/downloads/iso-639-3.tab";
const fileContent = await fetch(isoFileUrl).then(response => response.text());
const mainFileEntries = parseTsvToObjects(fileContent, fileHeaders) as { [key in FileHeader]?: string }[];

// See https://iso639-3.sil.org/about/relationships
const bibliographicToTerminology: { [code: string]: string } = {};
const iso639_1_to_iso639_3: { [code: string]: string } = {};

for (const entry of mainFileEntries) {
  if (entry.Id == null || entry.Scope == null || entry.Language_Type == null) {
    throw new Error("Entry is Missing required fields: " + JSON.stringify(entry));
  }

  if (entry.Part2b && entry.Part2t && entry.Part2b !== entry.Part2t) {
    bibliographicToTerminology[entry.Part2b] = entry.Part2t;
  }

  if (entry.Part1) {
    iso639_1_to_iso639_3[entry.Part1] = entry.Id;
  }
}

const results = {
  bibliographicToTerminology,
  iso639_1_to_iso639_3
};

const json = JSON.stringify(results, null, 2);

const filePath = `${import.meta.dirname}/../src/SIL.XForge.Scripture/language_code_mapping.json`;

Deno.writeTextFileSync(filePath, json + "\n");
