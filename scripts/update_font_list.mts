#!/usr/bin/env -S deno run --allow-net --allow-write

// Updates the list of fonts supported by fonts.languagetechnology.org by finding the regular woff2 or woff file for
// each font family and writing the result to src/SIL.XForge.Scripture/fonts.json.

type FontFamilies = {
  [name: string]: {
    family: string;
    distributable: boolean;
    defaults?: {
      [format: string]: string;
    };
    files: {
      [fileName: string]: {
        flourl: string;
      };
    };
  };
};

const fonts: FontFamilies = await fetch("https://raw.githubusercontent.com/silnrsi/fonts/main/families.json").then(
  response => response.json()
);

// Step 1: Find woff2 or woff files for each font family

const filesByFamily: {
  [family: string]: { fileName: string; fileUrl: string }[];
} = {};

for (const entry of Object.values(fonts)) {
  if (entry.distributable !== true) continue;

  const defaultFileName = entry.defaults?.["woff2"] ?? entry.defaults?.["woff"] ?? entry.defaults?.["ttf"];
  if (defaultFileName == null) continue;

  const defaultFileUrl = entry.files[defaultFileName]?.flourl;

  filesByFamily[entry.family] ??= [];
  filesByFamily[entry.family].push({
    fileName: defaultFileName,
    fileUrl: defaultFileUrl
  });
}

// Step 2: Find the "Regular" version of each font family, by filtering the output of Step 1

const bestFileByFamily: { [family: string]: string } = {};

for (const [family, files] of Object.entries(filesByFamily)) {
  if (files.length === 1) {
    bestFileByFamily[family] = files[0].fileUrl;
  } else if (files.length > 1) {
    const matchingFiles = files.filter(file => file.fileUrl != null && /Regular/.test(file.fileName));
    if (matchingFiles.length === 1) {
      bestFileByFamily[family] = matchingFiles[0].fileUrl;
    } else if (matchingFiles.length > 1) {
      console.warn(
        `Multiple Regular files found for ${family}: ${matchingFiles.map(file => file.fileName).join(", ")}`
      );
    }
  } else if (files.length === 0) {
    console.warn(`No matching files found for ${family}`);
  }
}

// Step 3: Get the Noto fonts

const notoFonts = await fetch(
  "https://raw.githubusercontent.com/notofonts/notofonts.github.io/refs/heads/main/state.json"
).then(response => response.json());

const notoFontsByFamily: { [family: string]: string } = {};

for (const [_group, specification] of Object.entries(notoFonts)) {
  if ((specification as any).families == null) continue;

  for (const [family, familySpecification] of Object.entries((specification as any).families)) {
    const matchingFiles = (familySpecification as any).files.filter(file =>
      /^fonts\/\w+\/full\/otf\/\w+-Regular.otf$/.test(file)
    );

    if (matchingFiles.length === 0) {
      console.warn(`No matching files found for ${family}`);
      continue;
    }

    // sort by file name and use the shortest
    matchingFiles.sort((a, b) => a.length - b.length);

    if (matchingFiles.length > 1) {
      console.warn(`Multiple Regular files found for ${family}: ${matchingFiles.join(", ")}`);
      console.warn(`Using ${matchingFiles[0]}`);
    }

    const file = matchingFiles[0];

    const url = `https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/${file}`;
    notoFontsByFamily[family] = url;
    bestFileByFamily[family] = url;
  }
}

const filePath = `${import.meta.dirname}/../src/SIL.XForge.Scripture/fonts.json`;

Deno.writeTextFileSync(filePath, JSON.stringify(bestFileByFamily, null, 2) + "\n");
