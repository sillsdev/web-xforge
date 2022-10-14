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
using System.Linq;
using System.Text;
using SIL.Machine.Corpora;
using SIL.XForge.Services;
using SIL.Machine.WebApi.Services;

namespace SIL.XForge.Scripture.Services
{
    public class MachineCorporaService : DisposableBase, IMachineCorporaService
    {
        private readonly IFileSystemService _fileSystemService;
        private readonly ILogger<MachineProjectService> _logger;
        private readonly HttpClient _machineClient;
        private readonly ITextCorpusFactory _textCorpusFactory;

        public MachineCorporaService(
            IFileSystemService fileSystemService,
            IHttpClientFactory httpClientFactory,
            ILogger<MachineProjectService> logger,
            ITextCorpusFactory textCorpusFactory
        )
        {
            _fileSystemService = fileSystemService;
            _logger = logger;
            _machineClient = httpClientFactory.CreateClient(MachineProjectService.ClientName);
            _textCorpusFactory = textCorpusFactory;
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

        public async Task UploadSFCorpusAsync(
            string corpusId,
            string languageTag,
            string projectId,
            CancellationToken cancellationToken
        )
        {
            // Reuse the SFTextCorpusFactory implementation
            ITextCorpus? source = await _textCorpusFactory.CreateAsync(new[] { projectId }, TextCorpusType.Source);
            ITextCorpus? target = await _textCorpusFactory.CreateAsync(new[] { projectId }, TextCorpusType.Target);

            // Clean any null values
            IEnumerable<IText> targetTexts = source?.Texts ?? Array.Empty<IText>();
            IEnumerable<IText> sourceTexts = target?.Texts ?? Array.Empty<IText>();

            // Submit each text
            foreach (IText text in sourceTexts.Concat(targetTexts))
            {
                var sb = new StringBuilder();
                foreach (TextSegment segment in text.GetSegments())
                {
                    if (!segment.IsEmpty)
                    {
                        if (segment.SegmentRef is TextSegmentRef textSegmentRef)
                        {
                            sb.Append(string.Join('-', textSegmentRef.Keys));
                        }
                        else
                        {
                            sb.Append(segment.SegmentRef);
                        }

                        sb.Append('\t');
                        sb.Append(string.Join(' ', segment.Segment));
                        sb.Append('\t');
                        if (segment.IsSentenceStart)
                        {
                            sb.Append("ss,");
                        }

                        if (segment.IsInRange)
                        {
                            sb.Append("ir,");
                        }

                        if (segment.IsRangeStart)
                        {
                            sb.Append("rs,");
                        }

                        // Strip the last comma, or the tab if there are no flags
                        sb.Length--;
                        sb.AppendLine();
                    }
                }

                if (sb.Length > 0)
                {
                    // TODO: See if the corpus exists (check DB and server), delete it if it does
                    // TODO: Record the fileId and a checksum
                    // TODO: Only upload the file if the checksum is different
                    string _ = await UploadCorpusTextAsync(
                        corpusId,
                        languageTag,
                        text.Id,
                        sb.ToString(),
                        cancellationToken
                    );
                }
            }
        }

        protected override void DisposeManagedResources()
        {
            _machineClient.Dispose();
        }
    }
}
