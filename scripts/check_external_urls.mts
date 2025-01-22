#!/usr/bin/env -S deno run --allow-net

// This script checks that all links from the ExternalUrls class are valid. It can optionally take a help URL as an
// argument, so that it can be tested against a non-production copy of the help site.
//
// Suggested usage:
//
// Check against production:
// ./check_external_urls.mts
//
// Check against the Netlify preview build:
// ./check_external_urls.mts https://github-action-preview--scriptureforgehelp.netlify.app
//
// Check against a local copy of the help site:
// ./check_external_urls.mts http://localhost:8000

import { ExternalUrls } from "../src/SIL.XForge.Scripture/ClientApp/src/xforge-common/external-url-class.ts";
import locales from "../src/SIL.XForge.Scripture/locales.json" with { type: "json" };

let helpUrl = "https://help.scriptureforge.org";

if (Deno.args.length == 1) {
  helpUrl = Deno.args[0];
} else if (Deno.args.length > 1) {
  console.error("Usage: check_external_urls.mts [help URL]");
  Deno.exit(1);
}

console.log(`Using help URL: ${helpUrl}`);

const urlsToCheck = new Set<string>();

for (const locale of locales) {
  if (!locale.helps) continue;

  const externalUrls = new ExternalUrls(
    { locale: { helps: locale.helps } },
    { helpUrl, defaultLocaleHelpString: "en" }
  );

  // Enumerate properties where the value is a string
  for (const value of Object.values(externalUrls)) {
    if (typeof value === "string") {
      urlsToCheck.add(value);
    }
  }

  // Enumerate getters
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(externalUrls)))) {
    if ("get" in descriptor && typeof descriptor.get === "function") {
      urlsToCheck.add(descriptor.get.call(externalUrls));
    }
  }
}

const results = await Promise.all(
  Array.from(urlsToCheck).map(async url => {
    const response = await fetch(url);
    return { url, status: response.status, body: await response.text() };
  })
);

let failure = false;
for (const result of results) {
  if (result.status !== 200) {
    failure = true;
    console.error(`Error: ${result.url} returned status ${result.status}`);
  } else if (
    // Check for anchor in the URL, but skip RoboHelp pages, as they use anchors oddly
    result.url.includes("#") &&
    !result.url.includes("/manual") &&
    !result.body.includes(`id="${result.url.split("#")[1]}"`)
  ) {
    failure = true;
    console.error(`Error: ${result.url} returned body that does not contain the expected anchor`);
  }
}

if (failure) {
  Deno.exit(1);
} else {
  console.log("All links are valid");
}
