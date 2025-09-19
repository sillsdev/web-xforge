#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

const projectId = Deno.env.get('CROWDIN_PROJECT_ID');
const apiKey = Deno.env.get('CROWDIN_API_KEY');
const projectRoot = Deno.cwd();

if (!projectId || !apiKey) {
  console.error('CROWDIN_PROJECT_ID and CROWDIN_API_KEY environment variables are required');
  Deno.exit(1);
}

async function ensureSuccess(response: Response): Promise<void> {
  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(
      `Request for ${response.url} failed with status code ${response.status}: ${response.statusText}\nResponse body: ${responseBody}`
    );
  }
}

/** Represents a mapping between a local file and its Crowdin file path & metadata. */
interface CrowdinFile {
  localPath: string;
  crowdinPath: string;
  contentType: string;
  fileName: string;
}

/** Describes the status of a single file relative to Crowdin (presence and whether content differs). */
interface FileStatus {
  file: CrowdinFile;
  exists: boolean;
  needsUpdate: boolean;
  error?: string;
}

// Files to upload to Crowdin
const filesToUpload: CrowdinFile[] = [
  {
    localPath: 'src/SIL.XForge.Scripture/ClientApp/src/assets/i18n/checking_en.json',
    crowdinPath: '/checking_en.json',
    contentType: 'application/json'
  },
  {
    localPath: 'src/SIL.XForge.Scripture/ClientApp/src/assets/i18n/non_checking_en.json',
    crowdinPath: '/non_checking_en.json',
    contentType: 'application/json'
  },
  {
    localPath: 'src/SIL.XForge.Scripture/Resources/SharedResource.resx',
    crowdinPath: '/SharedResource.resx',
    contentType: 'application/xml'
  },
  {
    localPath: 'src/SIL.XForge.Scripture/Resources/Pages.Index.resx',
    crowdinPath: '/Pages.Index.resx',
    contentType: 'application/xml'
  },
  {
    localPath: 'src/SIL.XForge.Scripture/Resources/Pages.NotFound.resx',
    crowdinPath: '/Pages.NotFound.resx',
    contentType: 'application/xml'
  }
].map(file => {
  return {
    ...file,
    fileName: file.crowdinPath.startsWith('/') ? file.crowdinPath.slice(1) : file.crowdinPath
  };
});

/** Downloads the current content of a Crowdin file by ID. */
async function downloadFileContent(fileId: number): Promise<string> {
  // Get download URL
  const response = await fetch(`https://api.crowdin.com/api/v2/projects/${projectId}/files/${fileId}/download`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  });
  await ensureSuccess(response);
  const downloadInfo = await response.json();
  // Fetch file content
  const fileResponse = await fetch(downloadInfo.data.url);
  await ensureSuccess(fileResponse);
  return await fileResponse.text();
}

/** Uploads file content to Crowdin storage and returns the storage ID. */
async function uploadFileToStorage(file: CrowdinFile, fileContent: string): Promise<number> {
  console.log(`Uploading file content to storage for ${file.fileName}...`);
  const response = await fetch(`https://api.crowdin.com/api/v2/storages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': file.contentType,
      'Crowdin-API-FileName': encodeURIComponent(file.fileName)
    },
    body: fileContent
  });
  await ensureSuccess(response);
  const data = await response.json();
  return data.data.id;
}

/** Updates an existing Crowdin file with new content from storage. */
async function updateExistingFile(fileId: number, storageId: number, fileName: string): Promise<void> {
  console.log(`Updating existing file ${fileName}...`);
  const response = await fetch(`https://api.crowdin.com/api/v2/projects/${projectId}/files/${fileId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      storageId: storageId,
      updateOption: 'clear_translations_and_approvals'
    })
  });
  await ensureSuccess(response);
  console.log(`Successfully updated ${fileName}`);
}

/** Determines if the local file differs from the remote Crowdin version. */
async function checkFileStatus(file: CrowdinFile, existingFiles: Record<string, number>): Promise<FileStatus> {
  const fullPath = `${projectRoot}/${file.localPath}`;
  if (!existingFiles[file.crowdinPath]) {
    return { file, exists: false, needsUpdate: false, error: `File '${file.crowdinPath}' does not exist on Crowdin` };
  }
  try {
    const localContent = await Deno.readTextFile(fullPath);
    const crowdinContent = await downloadFileContent(existingFiles[file.crowdinPath]);
    const needsUpdate = localContent !== crowdinContent;
    return { file, exists: true, needsUpdate };
  } catch (error) {
    return { file, exists: true, needsUpdate: false, error: `Failed to check file status: ${error}` };
  }
}

/** Performs the full upload cycle for a single file (read -> storage -> update existing file). */
async function uploadFile(file: CrowdinFile, existingFiles: Record<string, number>): Promise<boolean> {
  const fullPath = `${projectRoot}/${file.localPath}`;
  try {
    if (!existingFiles[file.crowdinPath]) {
      console.error(
        `ERROR: File '${file.crowdinPath}' does not exist on Crowdin! This indicates a configuration problem.`
      );
      console.error(`  Local file: ${file.localPath}`);
      return false;
    }
    const fileContent = await Deno.readTextFile(fullPath);
    const storageId = await uploadFileToStorage(file, fileContent);
    await updateExistingFile(existingFiles[file.crowdinPath], storageId, file.crowdinPath);
    return true;
  } catch (error) {
    console.error(`Failed to upload ${file.localPath}:`, error);
    return false;
  }
}

/** Retrieves existing Crowdin files and maps path -> file ID. */
async function getExistingFiles(): Promise<Record<string, number>> {
  console.log('Fetching existing files from Crowdin...');
  const filesPerPage = 500; // max supported by Crowdin API
  const response = await fetch(`https://api.crowdin.com/api/v2/projects/${projectId}/files?limit=${filesPerPage}`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  });
  await ensureSuccess(response);
  const data = await response.json();
  const existingFiles: Record<string, number> = {};
  for (const file of data.data) {
    existingFiles[file.data.path] = file.data.id;
  }

  // At the time of writing the script, 36 files are fetched, so hitting the limit of 500 is mostly theoretical
  if (Object.keys(existingFiles).length >= filesPerPage) {
    throw new Error(`Hit pagination limit of ${filesPerPage} files. Please implement pagination handling.`);
  }

  return existingFiles;
}

console.log('Starting file upload to Crowdin...');
console.log(`Project ID: ${projectId}`);

try {
  const existingFiles = await getExistingFiles();

  // Check status of all files
  console.log('\nChecking file status...');
  const fileStatuses: FileStatus[] = [];

  for (const file of filesToUpload) {
    const status = await checkFileStatus(file, existingFiles);
    fileStatuses.push(status);
  }

  // Print status summary
  console.log('\nFile Status Summary:');
  console.log('===================');

  let hasErrors = false;
  const filesToUpdate: FileStatus[] = [];

  for (const status of fileStatuses) {
    if (status.error) {
      console.log(`❌ ${status.file.crowdinPath}: ${status.error}`);
      hasErrors = true;
    } else if (!status.exists) {
      console.log(`❌ ${status.file.crowdinPath}: Missing from Crowdin`);
      hasErrors = true;
    } else if (status.needsUpdate) {
      console.log(`🔄 ${status.file.crowdinPath}: Needs update`);
      filesToUpdate.push(status);
    } else {
      console.log(`✅ ${status.file.crowdinPath}: Up to date`);
    }
  }

  if (hasErrors) {
    console.error('\nSome files have errors. Exiting with error status.');
    Deno.exit(1);
  }

  if (filesToUpdate.length === 0) {
    console.log('\n🎉 All files are up to date! No updates needed.');
    Deno.exit(0);
  }

  // Update files that need updating
  console.log(`\nUpdating ${filesToUpdate.length} file(s)...`);

  for (const status of filesToUpdate) {
    const success = await uploadFile(status.file, existingFiles);
    if (!success) {
      hasErrors = true;
    }
  }

  if (hasErrors) {
    console.error('Some files failed to upload. Exiting with error status.');
    Deno.exit(1);
  }

  console.log(`\n🎉 Successfully updated ${filesToUpdate.length} file(s) on Crowdin!`);
} catch (error) {
  console.error('Failed to upload files to Crowdin:', error);
  Deno.exit(1);
}
