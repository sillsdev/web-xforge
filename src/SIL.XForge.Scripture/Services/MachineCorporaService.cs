using System;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// The Machine Corpora service.
    /// </summary>
    /// <remarks>
    /// This should only be called from <see cref="MachineProjectService"/>,
    /// and exists to allow proper unit testing of the Machine API integration.
    /// TODO: When Machine > 2.5.X, change all object usage to the appropriate corpus DTO
    /// </remarks>
    public class MachineCorporaService : MachineServiceBase, IMachineCorporaService
    {
        private readonly IExceptionHandler _exceptionHandler;
        private readonly IFileSystemService _fileSystemService;

        public MachineCorporaService(
            IExceptionHandler exceptionHandler,
            IFileSystemService fileSystemService,
            IHttpClientFactory httpClientFactory
        ) : base(httpClientFactory)
        {
            _exceptionHandler = exceptionHandler;
            _fileSystemService = fileSystemService;
        }

        /// <summary>
        /// Adds a corpus to a translation engine.
        /// </summary>
        /// <param name="translationEngineId">The translation engine identifier.</param>
        /// <param name="corpusId">The corpus identifier</param>
        /// <param name="pretranslate">
        /// If <c>true</c>, enable pre-translation.
        /// This is only to be enabled with Nmt translation engine types.
        /// </param>
        /// <param name="cancellationToken">The cancellation token.</param>
        /// <returns>The asynchronous task.</returns>
        /// <exception cref="HttpRequestException">
        /// An error occurred adding the corpus to the translation engine.
        /// </exception>
        /// <remarks>Pre-translation is not currently used by Scripture Forge.</remarks>
        public async Task AddCorpusToTranslationEngineAsync(
            string translationEngineId,
            string corpusId,
            bool pretranslate,
            CancellationToken cancellationToken
        )
        {
            // Add the corpus to the Machine API
            ValidateId(translationEngineId);
            ValidateId(corpusId);
            string requestUri = $"translation-engines/{translationEngineId}/corpora";
            using var response = await MachineClient.PostAsJsonAsync(
                requestUri,
                new { corpusId, pretranslate },
                cancellationToken
            );
            await _exceptionHandler.EnsureSuccessStatusCode(response);

            try
            {
                var corpus = await ReadAnonymousObjectFromJsonAsync(
                    response,
                    new { corpus = new { id = string.Empty } },
                    Options,
                    cancellationToken
                );
                if (corpus?.corpus.id != corpusId)
                {
                    throw new DataNotFoundException("The corpus could not be added to the translation");
                }
            }
            catch (Exception e)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response), e);
            }
        }

        /// <summary>
        /// Creates a corpus.
        /// </summary>
        /// <param name="name">The corpus name.</param>
        /// <param name="paratext">
        /// If <c>true</c>, texts will be uploaded using <see cref="UploadParatextCorpusAsync"/>;
        /// otherwise, upload texts via <see cref="UploadCorpusTextAsync"/>.
        /// </param>
        /// <param name="cancellationToken">The cancellation token.</param>
        /// <returns>The new corpus identifier.</returns>
        /// <exception cref="HttpRequestException">An error occurred creating the corpus.</exception>
        /// <remarks>The Paratext file upload is not currently used by Scripture Forge.</remarks>
        public async Task<string> CreateCorpusAsync(string name, bool paratext, CancellationToken cancellationToken)
        {
            // Add the corpus to the Machine API
            const string requestUri = "corpora";
            using var response = await MachineClient.PostAsJsonAsync(
                requestUri,
                new
                {
                    name,
                    format = paratext ? "Paratext" : "Text",
                    type = "Text",
                },
                cancellationToken
            );
            await _exceptionHandler.EnsureSuccessStatusCode(response);

            try
            {
                var corpus = await ReadAnonymousObjectFromJsonAsync(
                    response,
                    new { id = string.Empty },
                    Options,
                    cancellationToken
                );
                return corpus?.id ?? string.Empty;
            }
            catch (Exception e)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response), e);
            }
        }

        /// <summary>
        /// Deletes a corpus.
        /// </summary>
        /// <param name="corpusId">The corpus identifier.</param>
        /// <param name="cancellationToken">The cancellation token.</param>
        /// <returns>The asynchronous task.</returns>
        /// <remarks>
        /// The corpus files should be deleted using <see cref="DeleteCorpusFileAsync"/> before this method is executed.
        /// </remarks>
        public async Task DeleteCorpusAsync(string corpusId, CancellationToken cancellationToken)
        {
            // Delete the corpus from the Machine API
            ValidateId(corpusId);
            string requestUri = $"corpora/{corpusId}";
            using var response = await MachineClient.DeleteAsync(requestUri, cancellationToken);
            await _exceptionHandler.EnsureSuccessStatusCode(response);
        }

        /// <summary>
        /// Deletes a corpus file.
        /// </summary>
        /// <param name="corpusId">The corpus identifier.</param>
        /// <param name="fileId">The file identifier.</param>
        /// <param name="cancellationToken">The cancellation token.</param>
        /// <returns>The asynchronous task.</returns>
        public async Task DeleteCorpusFileAsync(string corpusId, string fileId, CancellationToken cancellationToken)
        {
            // Delete the corpus file from the Machine API
            ValidateId(corpusId);
            ValidateId(fileId);
            string requestUri = $"corpora/{corpusId}/files/{fileId}";
            using var response = await MachineClient.DeleteAsync(requestUri, cancellationToken);
            await _exceptionHandler.EnsureSuccessStatusCode(response);
        }

        /// <summary>
        /// Gets the files in a corpus.
        /// </summary>
        /// <param name="corpusId">The corpus identifier.</param>
        /// <param name="cancellationToken">The cancellation token.</param>
        /// <returns>A collection of the files in the corpus.</returns>
        /// <exception cref="HttpRequestException">An error occurred retrieving the files.</exception>
        public async Task<IList<MachineApiCorpusFile>> GetCorpusFilesAsync(
            string corpusId,
            CancellationToken cancellationToken
        )
        {
            // Get the corpus files from the Machine API
            ValidateId(corpusId);
            string requestUri = $"corpora/{corpusId}/files";
            using var response = await MachineClient.GetAsync(requestUri, cancellationToken);
            await _exceptionHandler.EnsureSuccessStatusCode(response);

            try
            {
                return await response.Content.ReadFromJsonAsync<MachineApiCorpusFile[]>(Options, cancellationToken)
                    ?? Array.Empty<MachineApiCorpusFile>();
            }
            catch (Exception e)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response), e);
            }
        }

        /// <summary>
        /// Removes a corpus from a translation engine.
        /// </summary>
        /// <param name="translationEngineId">The translation engine identifier.</param>
        /// <param name="corpusId">The corpus identifier.</param>
        /// <param name="cancellationToken">The cancellation token.</param>
        /// <returns>The asynchronous task.</returns>
        /// <remarks>This method does not delete the corpus.</remarks>
        public async Task RemoveCorpusFromTranslationEngineAsync(
            string translationEngineId,
            string corpusId,
            CancellationToken cancellationToken
        )
        {
            // Remove the corpus from the translation engine on the Machine API
            ValidateId(translationEngineId);
            ValidateId(corpusId);
            string requestUri = $"translation-engines/{translationEngineId}/corpora/{corpusId}";
            using var response = await MachineClient.DeleteAsync(requestUri, cancellationToken);
            await _exceptionHandler.EnsureSuccessStatusCode(response);
        }

        /// <summary>
        /// Uploads a text file to a corpus.
        /// </summary>
        /// <param name="corpusId">The corpus identifier.</param>
        /// <param name="languageTag">The language tag.</param>
        /// <param name="textId">The text identifier.</param>
        /// <param name="text">The text file data.</param>
        /// <param name="cancellationToken">The cancellation token.</param>
        /// <returns>The file identifier.</returns>
        /// <exception cref="HttpRequestException">An error occurred uploading the text file.</exception>
        /// <remarks>
        /// The text file is created by the <see cref="MachineProjectService"/>
        /// using the <see cref="SFTextCorpusFactory"/>.
        /// </remarks>
        public async Task<string> UploadCorpusTextAsync(
            string corpusId,
            string languageTag,
            string textId,
            string text,
            CancellationToken cancellationToken
        )
        {
            // Validate input
            ValidateId(corpusId);

            // Upload the text file
            using var content = new MultipartFormDataContent();
            byte[] byteArray = Encoding.UTF8.GetBytes(text);
            await using var memoryStream = new MemoryStream(byteArray);
            using var fileContent = new StreamContent(memoryStream);
            fileContent.Headers.ContentType = new MediaTypeHeaderValue("text/plain")
            {
                CharSet = Encoding.UTF8.WebName,
            };
            string fileName = string.Join("_", textId.Split(Path.GetInvalidFileNameChars()));
            content.Add(fileContent, "file", $"{fileName}.txt");
            content.Add(new StringContent(languageTag), "languageTag");
            content.Add(new StringContent(textId), "textId");

            string requestUri = $"corpora/{corpusId}/files";
            var response = await MachineClient.PostAsync(requestUri, content, cancellationToken);
            await _exceptionHandler.EnsureSuccessStatusCode(response);

            try
            {
                var file = await ReadAnonymousObjectFromJsonAsync(
                    response,
                    new { id = string.Empty },
                    Options,
                    cancellationToken
                );
                return file?.id ?? string.Empty;
            }
            catch (Exception e)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response), e);
            }
        }

        /// <summary>
        /// Uploads a Paratext project directory to a corpus.
        /// </summary>
        /// <param name="corpusId">The corpus identifier.</param>
        /// <param name="languageTag">The language tag.</param>
        /// <param name="path">The path to the Paratext project.</param>
        /// <param name="cancellationToken">The cancellation token.</param>
        /// <returns>The file identifier.</returns>
        /// <exception cref="DirectoryNotFoundException">The Paratext project directory does not exist.</exception>
        /// <exception cref="HttpRequestException">An error occurred uploading the Paratext project.</exception>
        /// <remarks>This is not currently used by Scripture Forge.</remarks>
        public async Task<string> UploadParatextCorpusAsync(
            string corpusId,
            string languageTag,
            string path,
            CancellationToken cancellationToken
        )
        {
            // Validate input
            ValidateId(corpusId);

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
            var response = await MachineClient.PostAsync(requestUri, content, cancellationToken);
            await _exceptionHandler.EnsureSuccessStatusCode(response);

            try
            {
                var file = await ReadAnonymousObjectFromJsonAsync(
                    response,
                    new { id = string.Empty },
                    Options,
                    cancellationToken
                );
                return file?.id ?? string.Empty;
            }
            catch (Exception e)
            {
                throw new HttpRequestException(await ExceptionHandler.CreateHttpRequestErrorMessage(response), e);
            }
        }
    }
}
