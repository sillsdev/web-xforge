#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write --allow-run=unzip --allow-env

const projectId = Deno.env.get("CROWDIN_PROJECT_ID");
const apiKey = Deno.env.get("CROWDIN_API_KEY");
const projectRoot = Deno.cwd();

async function saveLatestBuild() {
  // Create a new build
  const response = await fetch(`https://api.crowdin.com/api/v2/projects/${projectId}/translations/builds`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-type": "application/json" },
    body: JSON.stringify({
      skipUntranslatedStrings: false,
      skipUntranslatedFiles: false,
      exportApprovedOnly: false
    })
  });

  const buildResponseBody = await response.json();

  const buildId = buildResponseBody.data.id;

  // Poll the build status
  let finished = false;
  while (finished === false) {
    console.log("Checking build status...");

    const buildStatusResponse = await fetch(
      `https://api.crowdin.com/api/v2/projects/${projectId}/translations/builds/${buildId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    const buildStatusBody = await buildStatusResponse.json();

    if (buildStatusBody.data.status === "finished") {
      finished = true;
    } else {
      console.log(`Build status: ${buildStatusBody.data.status}. Waiting for 5 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log("Build finished!");

  const buildDownloadResponse = await fetch(
    `https://api.crowdin.com/api/v2/projects/${projectId}/translations/builds/${buildId}/download`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );

  const buildDownloadBody = await buildDownloadResponse.json();
  const buildUrl = buildDownloadBody.data.url;

  // Download and save the file
  console.log("Downloading the build:");
  console.log(buildUrl);
  const downloadResponse = await fetch(buildUrl);
  const arrayBuffer = await downloadResponse.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const zipFilePath = `${projectRoot}/translations.zip`;
  await Deno.writeFile(zipFilePath, buffer);

  console.log("File downloaded and saved to", zipFilePath);

  // Extract the zip file
  const command = new Deno.Command("unzip", {
    args: ["-o", zipFilePath, "-d", `${projectRoot}/translations`],
    stdout: "piped",
    stderr: "piped"
  });

  const { code, stderr } = await command.output();
  if (code === 0) {
    console.log("Extraction completed successfully.");
  } else {
    const errorString = new TextDecoder().decode(stderr);
    console.error("Extraction failed:", errorString);
  }
}

const dirMapping = [
  {
    source: `${projectRoot}/translations/ClientApp/src/assets/i18n`,
    dest: `${projectRoot}/src/SIL.XForge.Scripture/ClientApp/src/assets/i18n`,
    localeSeparator: "_"
  },
  {
    source: `${projectRoot}/translations/Resources`,
    dest: `${projectRoot}/src/SIL.XForge.Scripture/Resources`,
    localeSeparator: "-"
  }
];

const localeRegex = /[\._]((?:[a-z]{2}[_-][A-Z]{2})|(?:[a-z]{3}))\.(?:resx|json)$/;

import locales from "../src/SIL.XForge.Scripture/locales.json" with { type: "json" };

async function copyFiles() {
  for (const { source, dest, localeSeparator } of Object.values(dirMapping)) {
    console.log(`Copying files from ${source} to ${dest}`);

    for await (const dirEntry of Deno.readDir(source)) {
      if (dirEntry.isFile) {
        const crowdinFileName = dirEntry.name;
        const localeCodeInCrowdinFile = crowdinFileName.match(localeRegex)![1];
        const localeCodeWithHyphens = localeCodeInCrowdinFile.replaceAll("_", "-");
        const localeObject = locales.find(l => l.tags.includes(localeCodeWithHyphens));
        if (localeObject == null) continue;

        const localeInOutputFileName = localeObject.tags[0].replaceAll("-", localeSeparator);
        const newFileName = crowdinFileName.replace(localeCodeInCrowdinFile, localeInOutputFileName);

        const oldFile = `${source}/${crowdinFileName}`;
        const newFile = `${dest}/${newFileName}`;
        await Deno.copyFile(oldFile, newFile);
      }
    }
  }
}

async function cleanup() {
  await Deno.remove(`${projectRoot}/translations.zip`);
  await Deno.remove(`${projectRoot}/translations`, { recursive: true });
}

try {
  console.log("--- Fetching latest build ---");
  await saveLatestBuild();
  console.log("--- Copying files ---");
  await copyFiles();
} catch(e) {
  console.error(e);
} finally {
  console.log("--- Cleaning up ---");
  await cleanup();
}
