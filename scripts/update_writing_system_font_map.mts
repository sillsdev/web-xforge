#!/usr/bin/env -S deno run --allow-net --allow-write

// Step 1: Map writing systems to font families by family ID

const fallbacks = await(
  await fetch("https://raw.githubusercontent.com/silnrsi/langfontfinder/refs/heads/main/data/fallback.json")
).json();

const writingSystemRegionFallbackMap: { [key: string]: string } = {};

for (const [writingSystem, specifications] of Object.entries(fallbacks)) {
  for (const specification of specifications as any) {
    const fontId = specification.roles.default[0];
    for (const region of specification["regions"] ?? [null]) {
      if (region === null) {
        writingSystemRegionFallbackMap[writingSystem] = fontId;
      } else {
        writingSystemRegionFallbackMap[`${writingSystem}-${region}`] = fontId;
      }
    }
  }
}

// Step 2: Find the font families that we can load

import fontsByUrl from '../src/SIL.XForge.Scripture/fonts.json' with { type: 'json' };

const loadableFontFamilies = Object.keys(fontsByUrl);

// Step 3: Create a map of writing systems to font families

const families = await fetch("https://raw.githubusercontent.com/silnrsi/fonts/refs/heads/main/families.json").then(
  response => response.json()
);

const writingSystemFontFamilyNameMap: { [writingSystem: string]: string } = {};

for (const [writingSystem, fontId] of Object.entries(writingSystemRegionFallbackMap)) {
    const family = families[fontId];
    if (family && loadableFontFamilies.includes(family.family)) {
      writingSystemFontFamilyNameMap[writingSystem] = family.family;
    }
}

const filePath = `${import.meta.dirname}/../src/SIL.XForge.Scripture/writing_system_font_map.json`;

Deno.writeTextFileSync(filePath, JSON.stringify(writingSystemFontFamilyNameMap, null, 2) + "\n");
