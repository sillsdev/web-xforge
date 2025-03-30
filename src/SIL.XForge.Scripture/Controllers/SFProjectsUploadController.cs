using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Net.Http.Headers;
using NPOI.HSSF.UserModel;
using NPOI.SS.UserModel;
using NPOI.XSSF.UserModel;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

/// <summary>
/// Provides methods for uploading files.
/// </summary>
[Authorize]
[Route(UrlConstants.CommandApiNamespace + "/" + UrlConstants.Projects)]
public class SFProjectsUploadController : ControllerBase
{
    private readonly IExceptionHandler _exceptionHandler;
    private readonly IFileSystemService _fileSystemService;
    private readonly IHttpRequestAccessor _httpRequestAccessor;
    private readonly ISFProjectService _projectService;
    private readonly ITrainingDataService _trainingDataService;
    private readonly IUserAccessor _userAccessor;

    public SFProjectsUploadController(
        IExceptionHandler exceptionHandler,
        IFileSystemService fileSystemService,
        IHttpRequestAccessor httpRequestAccessor,
        ISFProjectService projectService,
        ITrainingDataService trainingDataService,
        IUserAccessor userAccessor
    )
    {
        _fileSystemService = fileSystemService;
        _httpRequestAccessor = httpRequestAccessor;
        _projectService = projectService;
        _trainingDataService = trainingDataService;
        _userAccessor = userAccessor;
        _exceptionHandler = exceptionHandler;
        _exceptionHandler.RecordUserIdForException(_userAccessor.UserId);
    }

    /// <summary>
    /// Converts an Excel spreadsheet to a two column CSV file.
    /// </summary>
    /// <response code="200">The file was uploaded successfully.</response>
    /// <response code="400">The data or parameters were malformed.</response>
    /// <remarks>
    /// To increase or decrease the file size limit, modify the RequestSizeLimit attribute for this method.
    /// </remarks>
    [HttpPost("convert-to-csv")]
    [RequestSizeLimit(100_000_000)]
    public async Task<IActionResult> ConvertToCsvAsync()
    {
        try
        {
            // Upload, convert and return the CSV file
            await using MemoryStream fileStream = new MemoryStream();
            using IWorkbook workbook = await GetWorkbookFromFileUploadStreamAsync(fileStream);
            MemoryStream outputStream = new MemoryStream();
            await _trainingDataService.ConvertExcelToCsvAsync(workbook, outputStream);

            // Reset the stream position before returning
            outputStream.Seek(0, SeekOrigin.Begin);
            return File(outputStream, "text/csv", "output.csv");
        }
        catch (FormatException)
        {
            return BadRequest();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string> { { "method", "ConvertToCsvAsync" } }
            );
            throw;
        }
    }

    /// <summary>
    /// Uploads an audio file.
    /// </summary>
    /// <response code="200">The file was uploaded successfully.</response>
    /// <response code="400">The data or parameters were malformed.</response>
    /// <response code="403">Insufficient permission to upload a file to this project.</response>
    /// <response code="404">The project does not exist.</response>
    /// <remarks>
    /// To increase or decrease the file size limit, modify the RequestSizeLimit attribute for this method.
    /// </remarks>
    [HttpPost("audio")]
    [RequestSizeLimit(100_000_000)]
    public async Task<IActionResult> UploadAudioAsync()
    {
        // Declare the form values
        string projectId = string.Empty;
        string dataId = string.Empty;
        string path = string.Empty;

        try
        {
            // Upload, convert and save the audio file
            (dataId, path, projectId) = await HandleFileUploadAsync();
            Uri relativeUri = await _projectService.SaveAudioAsync(_userAccessor.UserId, projectId, dataId, path);
            Uri uri = new Uri(_httpRequestAccessor.SiteRoot, relativeUri);
            return Created(uri.PathAndQuery, Path.GetFileName(uri.AbsolutePath));
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (FormatException)
        {
            return BadRequest();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "UploadAudioAsync" },
                    { "projectId", projectId },
                    { "dataId", dataId },
                }
            );
            throw;
        }
        finally
        {
            // Delete the temporary file, if it still exists
            if (!string.IsNullOrEmpty(path) && _fileSystemService.FileExists(path))
            {
                _fileSystemService.DeleteFile(path);
            }
        }
    }

    /// <summary>
    /// Uploads a training data file.
    /// </summary>
    /// <response code="200">The file was uploaded successfully.</response>
    /// <response code="400">The data or parameters were malformed.</response>
    /// <response code="403">Insufficient permission to upload a file to this project.</response>
    /// <response code="404">The project does not exist.</response>
    /// <remarks>
    /// To increase or decrease the file size limit, modify the RequestSizeLimit attribute for this method.
    /// </remarks>
    [HttpPost("training-data")]
    [RequestSizeLimit(100_000_000)]
    public async Task<IActionResult> UploadTrainingDataAsync()
    {
        // Declare the form values
        string projectId = string.Empty;
        string dataId = string.Empty;
        string path = string.Empty;

        try
        {
            // Upload, convert and save the training data file
            (dataId, path, projectId) = await HandleFileUploadAsync();
            Uri relativeUri = await _trainingDataService.SaveTrainingDataAsync(
                _userAccessor.UserId,
                projectId,
                dataId,
                path
            );
            Uri uri = new Uri(_httpRequestAccessor.SiteRoot, relativeUri);
            return Created(uri.PathAndQuery, Path.GetFileName(uri.AbsolutePath));
        }
        catch (ForbiddenException)
        {
            return Forbid();
        }
        catch (DataNotFoundException)
        {
            return NotFound();
        }
        catch (FormatException)
        {
            return BadRequest();
        }
        catch (Exception)
        {
            _exceptionHandler.RecordEndpointInfoForException(
                new Dictionary<string, string>
                {
                    { "method", "UploadTrainingDataAsync" },
                    { "projectId", projectId },
                    { "dataId", dataId },
                }
            );
            throw;
        }
        finally
        {
            // Delete the temporary file, if it still exists
            if (!string.IsNullOrEmpty(path) && _fileSystemService.FileExists(path))
            {
                _fileSystemService.DeleteFile(path);
            }
        }
    }

    /// <summary>
    /// Get the Excel workbook via streaming to avoid request and form limits in ASP.NET Core.
    /// </summary>
    /// <param name="fileStream">The stream to be used for the file.</param>
    /// <returns>An Excel workbook, if present.</returns>
    /// <remarks>
    /// Never use a cancellation token with this method - it will result in stream errors.
    /// </remarks>
    /// <exception cref="FormatException">The request is an invalid format.</exception>
    private async Task<IWorkbook> GetWorkbookFromFileUploadStreamAsync(Stream fileStream)
    {
        // The Content-Type must be a form-data request, and a boundary should be found in it
        if (
            !Request.HasFormContentType
            || !MediaTypeHeaderValue.TryParse(Request.ContentType, out var mediaTypeHeader)
            || string.IsNullOrEmpty(mediaTypeHeader.Boundary.Value)
        )
        {
            throw new FormatException();
        }

        // Strip double quotes from boundary, if present
        // See https://datatracker.ietf.org/doc/html/rfc2046#section-5.1.1
        string boundary = HeaderUtilities.RemoveQuotes(mediaTypeHeader.Boundary).Value ?? string.Empty;

        // Read the multipart data
        MultipartReader reader = new MultipartReader(boundary, Request.Body);
        MultipartSection section = await reader.ReadNextSectionAsync();

        // Iterate over each multipart section
        while (section is not null)
        {
            bool hasContentDisposition = ContentDispositionHeaderValue.TryParse(
                section.ContentDisposition,
                out var contentDisposition
            );

            // Return the file upload stream, when we find it
            if (
                hasContentDisposition
                && contentDisposition.DispositionType.Equals("form-data")
                && !string.IsNullOrEmpty(contentDisposition.FileName.Value)
            )
            {
                // NOTE: In the following code, we do not pass section.Body to the workbook constructor,
                // as synchronous operations are disallowed on that stream.

                // Only allow XLS or XLSX files, as the other types may contain macros.
                string extension = Path.GetExtension(contentDisposition.FileName.Value).ToUpperInvariant();
                switch (extension)
                {
                    case ".XLS":
                    {
                        // Return the Excel 97-2003 spreadsheet
                        await section.Body.CopyToAsync(fileStream);
                        fileStream.Seek(0, SeekOrigin.Begin);
                        return new HSSFWorkbook(fileStream);
                    }
                    case ".XLSX":
                    {
                        // Return the Excel 2007+ spreadsheet
                        await section.Body.CopyToAsync(fileStream);
                        fileStream.Seek(0, SeekOrigin.Begin);
                        return new XSSFWorkbook(fileStream);
                    }
                }
            }

            section = await reader.ReadNextSectionAsync();
        }

        // No supported file upload stream found
        throw new FormatException();
    }

    /// <summary>
    /// Handle the file upload via streaming to avoid request and form limits in ASP.NET Core
    /// </summary>
    /// <returns>A tuple with the dataId, path, and projectId.</returns>
    /// <remarks>
    /// Never use a cancellation token with this method - it will result in stream errors.
    /// </remarks>
    /// <exception cref="FormatException">The request is an invalid format.</exception>
    private async Task<(string dataId, string path, string projectId)> HandleFileUploadAsync()
    {
        // Declare the form values
        string projectId = string.Empty;
        string dataId = string.Empty;
        string path = string.Empty;

        // The Content-Type must be a form-data request, and a boundary should be found in it
        if (
            !Request.HasFormContentType
            || !MediaTypeHeaderValue.TryParse(Request.ContentType, out var mediaTypeHeader)
            || string.IsNullOrEmpty(mediaTypeHeader.Boundary.Value)
        )
        {
            throw new FormatException();
        }

        // Strip double quotes from boundary, if present
        // See https://datatracker.ietf.org/doc/html/rfc2046#section-5.1.1
        string boundary = HeaderUtilities.RemoveQuotes(mediaTypeHeader.Boundary).Value ?? string.Empty;

        // Read the multipart data
        MultipartReader reader = new MultipartReader(boundary, Request.Body);
        MultipartSection section = await reader.ReadNextSectionAsync();

        // Iterate over each multipart section
        while (section is not null)
        {
            bool hasContentDisposition = ContentDispositionHeaderValue.TryParse(
                section.ContentDisposition,
                out var contentDisposition
            );

            if (
                hasContentDisposition
                && contentDisposition.DispositionType.Equals("form-data")
                && !string.IsNullOrEmpty(contentDisposition.FileName.Value)
            )
            {
                // If we have a filename, get the file being uploaded...

                // Get the filename so we can get the extension
                string fileName = contentDisposition.FileName.Value ?? string.Empty;

                // Strip invalid characters from the file name
                fileName = Path.GetInvalidFileNameChars()
                    .Aggregate(fileName, (current, c) => current.Replace(c.ToString(), string.Empty));

                // Get the path to the temporary file
                path = Path.Combine(Path.GetTempPath(), Path.GetRandomFileName() + Path.GetExtension(fileName));

                // Write the incoming file data to the temporary file
                await using Stream fileStream = _fileSystemService.CreateFile(path);
                await section.Body.CopyToAsync(fileStream);
            }
            else if (
                hasContentDisposition
                && contentDisposition.DispositionType.Equals("form-data")
                && string.IsNullOrEmpty(contentDisposition.FileName.Value)
                && string.IsNullOrEmpty(contentDisposition.FileNameStar.Value)
            )
            {
                // If we do not have a filename, get the other form data...

                // Get the media type encoding
                bool hasMediaTypeHeader = MediaTypeHeaderValue.TryParse(section.ContentType, out var mediaType);
                // Disable the following warning: The UTF-7 encoding is insecure and should not be used.
#pragma warning disable SYSLIB0001
                // As UTF-7 is insecure, substitute UTF-8. If no encoding is specified, default to UTF-8
                Encoding encoding =
                    !hasMediaTypeHeader || Encoding.UTF7.Equals(mediaType.Encoding) || mediaType.Encoding is null
                        ? Encoding.UTF8
                        : mediaType.Encoding;
#pragma warning restore SYSLIB0001

                using StreamReader streamReader = new StreamReader(
                    section.Body,
                    encoding,
                    detectEncodingFromByteOrderMarks: true,
                    bufferSize: 1024,
                    leaveOpen: true
                );

                // The value length limit is enforced by MultipartBodyLengthLimit
                string value = await streamReader.ReadToEndAsync();
                if (string.Equals(value, "undefined", StringComparison.OrdinalIgnoreCase))
                {
                    continue;
                }

                // Collect the required form values
                switch (HeaderUtilities.RemoveQuotes(contentDisposition.Name).Value)
                {
                    case "projectId":
                        projectId = value;
                        break;
                    case "dataId":
                        dataId = value;
                        break;
                }
            }

            section = await reader.ReadNextSectionAsync();
        }

        // Throw an error if we do not have the required data
        if (string.IsNullOrEmpty(projectId) || string.IsNullOrEmpty(dataId) || string.IsNullOrWhiteSpace(path))
        {
            throw new FormatException();
        }

        return (dataId, path, projectId);
    }
}
