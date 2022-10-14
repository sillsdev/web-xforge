#nullable enable

using System;
using System.Collections.Generic;
using Microsoft.Extensions.Logging;
using SIL.ObjectModel;
using System.Net.Http;
using System.Net.Http.Json;
using System.Threading.Tasks;
using Newtonsoft.Json;
using System.IO;
using System.Net.Http.Headers;
using System.Threading;
using System.IO.Compression;
using System.Text;
using SIL.XForge.Services;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    public class MachineCorporaService : DisposableBase, IMachineCorporaService
    {
        private readonly IFileSystemService _fileSystemService;
        private readonly ILogger<MachineProjectService> _logger;
        private readonly HttpClient _machineClient;

        public MachineCorporaService(
            IFileSystemService fileSystemService,
            IHttpClientFactory httpClientFactory,
            ILogger<MachineProjectService> logger
        )
        {
            _fileSystemService = fileSystemService;
            _logger = logger;
            _machineClient = httpClientFactory.CreateClient(MachineProjectService.ClientName);
        }

        public async Task<string> AddCorpusAsync(string name, bool paratext, CancellationToken cancellationToken)
        {
            // Add the corpus to the Machine API
            const string requestUri = "corpora";
            using var response = await _machineClient.PostAsJsonAsync(
                requestUri,
                new { name, format = paratext ? "Paratext" : "Text", type = "Text" },
                cancellationToken
            );
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }

            string data = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogInformation($"Response from {requestUri}: {data}");

            // Get the ID from the API response
            dynamic? corpus = JsonConvert.DeserializeObject<dynamic>(data);
            return corpus?.id ?? string.Empty;
        }

        public async Task<bool> AddCorpusToTranslationEngineAsync(
            string translationEngineId,
            string corpusId,
            bool pretranslate,
            CancellationToken cancellationToken
        )
        {
            // Add the corpora to the Machine API
            string requestUri = $"translation-engines/{translationEngineId}/corpora";
            using var response = await _machineClient.PostAsJsonAsync(
                requestUri,
                new { corpusId, pretranslate },
                cancellationToken
            );
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }

            string data = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogInformation($"Response from {requestUri}: {data}");

            // Verify the corpus ID from the API response
            dynamic? corpus = JsonConvert.DeserializeObject<dynamic>(data);
            return corpus?.corpus?.id == corpusId;
        }

        public async Task DeleteCorpusAsync(string corpusId, CancellationToken cancellationToken)
        {
            // Delete the corpus from the Machine API
            string requestUri = $"corpora/{corpusId}";
            using var response = await _machineClient.DeleteAsync(requestUri, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }
        }

        public async Task DeleteCorpusFileAsync(string corpusId, string fileId, CancellationToken cancellationToken)
        {
            // Delete the corpus file from the Machine API
            string requestUri = $"corpora/{corpusId}/files/{fileId}";
            using var response = await _machineClient.DeleteAsync(requestUri, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }
        }

        public async Task<IList<MachineApiCorpusFile>> GetCorpusFilesAsync(
            string corpusId,
            CancellationToken cancellationToken
        )
        {
            // Get the corpus files from the Machine API
            string requestUri = $"corpora/{corpusId}/files";
            using var response = await _machineClient.GetAsync(requestUri, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }

            string data = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogInformation($"Response from {requestUri}: {data}");

            // Retrieve the API response
            MachineApiCorpusFile[]? files = JsonConvert.DeserializeObject<MachineApiCorpusFile[]>(data);
            return files ?? Array.Empty<MachineApiCorpusFile>();
        }

        public async Task<string> UploadCorpusTextAsync(
            string corpusId,
            string languageTag,
            string textId,
            string text,
            CancellationToken cancellationToken
        )
        {
            // Upload the text file
            using var content = new MultipartFormDataContent();
            byte[] byteArray = Encoding.UTF8.GetBytes(text);
            await using var memoryStream = new MemoryStream(byteArray);
            using var fileContent = new StreamContent(memoryStream);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain")
            {
                CharSet = Encoding.UTF8.WebName
            };
            string fileName = string.Join("_", textId.Split(Path.GetInvalidFileNameChars()));
            content.Add(fileContent, "file", $"{fileName}.txt");
            content.Add(new StringContent(languageTag), "languageTag");
            content.Add(new StringContent(textId), "textId");

            string requestUri = $"corpora/{corpusId}/files";
            var response = await _machineClient.PostAsync(requestUri, content, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }

            string data = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogInformation($"Response from {requestUri}: {data}");

            // Return the file ID from the API response
            dynamic? file = JsonConvert.DeserializeObject<dynamic>(data);
            return file?.id ?? string.Empty;
        }

        public async Task<string> UploadParatextCorpusAsync(
            string corpusId,
            string languageTag,
            string path,
            CancellationToken cancellationToken
        )
        {
            // Ensure that the path exists
            if (!_fileSystemService.DirectoryExists(path))
            {
                throw new DirectoryNotFoundException($"The following directory could not be found: {path}");
            }

            // Create the zip file from the directory in memory
            await using var memoryStream = new MemoryStream();
            using (var archive = new ZipArchive(memoryStream, ZipArchiveMode.Create, true))
            {
                // Do not convert the ZipArchive using statement above into a using declaration,
                // otherwise the ZipArchive disposal will crash after the MemoryStream disposal.
                foreach (string filePath in _fileSystemService.EnumerateFiles(path))
                {
                    await using Stream fileStream = _fileSystemService.OpenFile(filePath, FileMode.Open);
                    ZipArchiveEntry entry = archive.CreateEntry(Path.GetFileName(filePath));
                    await using Stream entryStream = entry.Open();
                    await fileStream.CopyToAsync(entryStream, cancellationToken);
                }
            }

            // Upload the zip file
            using var content = new MultipartFormDataContent();
            using var fileContent = new StreamContent(memoryStream);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("application/zip");
            content.Add(fileContent, "file", $"{Path.GetDirectoryName(path)}.zip");
            content.Add(new StringContent(languageTag), "languageTag");

            string requestUri = $"corpora/{corpusId}/files";
            var response = await _machineClient.PostAsync(requestUri, content, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response));
            }

            string data = await response.Content.ReadAsStringAsync(cancellationToken);
            _logger.LogInformation($"Response from {requestUri}: {data}");

            // Return the file ID from the API response
            dynamic? file = JsonConvert.DeserializeObject<dynamic>(data);
            return file?.id ?? string.Empty;
        }

        protected override void DisposeManagedResources()
        {
            _machineClient.Dispose();
        }
    }
}
