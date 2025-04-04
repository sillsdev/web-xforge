using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using ICSharpCode.SharpZipLib.Zip;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using NPOI.HSSF.UserModel;
using NPOI.XSSF.UserModel;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

[TestFixture]
public class SFProjectsUploadControllerTests
{
    private const string Data01 = "data01";
    private const string Project01 = "project01";
    private const string User01 = "user01";
    private static readonly string[] Roles = [SystemRole.User];

    [Test]
    public async Task ConvertToCsvAsync_EmptyRequestFails()
    {
        await using var env = new TestEnvironment();
        env.CreateEmptyRequest();

        // SUT
        IActionResult actual = await env.Controller.ConvertToCsvAsync();
        Assert.IsInstanceOf<BadRequestResult>(actual);
    }

    [Test]
    public async Task ConvertToCsvAsync_MissingFileFails()
    {
        await using var env = new TestEnvironment();
        using HttpRequestMessage _ = await env.CreateFileUploadRequestAsync(Data01, Project01, null, null);

        // SUT
        IActionResult actual = await env.Controller.ConvertToCsvAsync();
        Assert.IsInstanceOf<BadRequestResult>(actual);
    }

    [Test]
    public async Task ConvertToCsvAsync_MissingFilenameFails()
    {
        await using var env = new TestEnvironment();
        await using MemoryStream fileStream = new MemoryStream();
        using HttpRequestMessage _ = await env.CreateFileUploadRequestAsync(Data01, Project01, null, fileStream);

        // SUT
        IActionResult actual = await env.Controller.ConvertToCsvAsync();
        Assert.IsInstanceOf<BadRequestResult>(actual);
    }

    [Test]
    public async Task ConvertToCsvAsync_UnexpectedException()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload of an invalid file that will throw an error
        const string fileName = "test.xlsx";
        await using MemoryStream fileStream = new MemoryStream();
        using HttpRequestMessage _ = await env.CreateFileUploadRequestAsync(null, null, fileName, fileStream);

        // SUT
        Assert.ThrowsAsync<ZipException>(env.Controller.ConvertToCsvAsync);
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task ConvertToCsvAsync_UnknownFileFails()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload of an invalid file that will throw an error
        const string fileName = "test.xlsm";
        await using MemoryStream fileStream = new MemoryStream();
        using HttpRequestMessage _ = await env.CreateFileUploadRequestAsync(Data01, Project01, fileName, fileStream);

        // SUT
        IActionResult actual = await env.Controller.ConvertToCsvAsync();
        Assert.IsInstanceOf<BadRequestResult>(actual);
    }

    [Test]
    public async Task ConvertExcelToCsvAsync_UploadXlsFile()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload
        const string fileName = "test.xls";
        await using MemoryStream fileStream = new MemoryStream();
        using HSSFWorkbook workbook = new HSSFWorkbook();
        workbook.Write(fileStream, leaveOpen: true);
        fileStream.Seek(0, SeekOrigin.Begin);
        using HttpRequestMessage _ = await env.CreateFileUploadRequestAsync(null, null, fileName, fileStream);

        // SUT
        IActionResult actual = await env.Controller.ConvertToCsvAsync();
        Assert.IsNotNull(actual);
        Assert.IsInstanceOf<FileResult>(actual);
        Assert.AreEqual("text/csv", (actual as FileResult)?.ContentType);
    }

    [Test]
    public async Task ConvertExcelToCsvAsync_UploadXlsxFile()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload
        const string fileName = "test.xlsx";
        await using MemoryStream fileStream = new MemoryStream();
        using XSSFWorkbook workbook = new XSSFWorkbook();
        workbook.Write(fileStream, leaveOpen: true);
        fileStream.Seek(0, SeekOrigin.Begin);
        using HttpRequestMessage _ = await env.CreateFileUploadRequestAsync(null, null, fileName, fileStream);

        // SUT
        IActionResult actual = await env.Controller.ConvertToCsvAsync();
        Assert.IsNotNull(actual);
        Assert.IsInstanceOf<FileResult>(actual);
        Assert.AreEqual("text/csv", (actual as FileResult)?.ContentType);
    }

    [Test]
    public async Task UploadAudioAsync_EmptyRequestFails()
    {
        await using var env = new TestEnvironment();
        env.CreateEmptyRequest();

        // SUT
        IActionResult actual = await env.Controller.UploadAudioAsync();
        Assert.IsInstanceOf<BadRequestResult>(actual);
    }

    [Test]
    public async Task UploadAudioAsync_Forbidden()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload
        const string fileName = "test.mp3";
        const string data = "ID3";
        using HttpRequestMessage _ = await env.CreateSuccessfulFileUploadResultAsync(Data01, Project01, fileName, data);

        // Throw the exception when saving the audio
        env.SFProjectService.SaveAudioAsync(User01, Project01, Data01, Arg.Any<string>())
            .Throws(new ForbiddenException());

        // SUT
        IActionResult actual = await env.Controller.UploadAudioAsync();
        Assert.IsNotNull(actual);
        Assert.IsInstanceOf<ForbidResult>(actual);
    }

    [Test]
    public async Task UploadAudioAsync_NotFound()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload
        const string fileName = "test.mp3";
        const string data = "ID3";
        using HttpRequestMessage _ = await env.CreateSuccessfulFileUploadResultAsync(Data01, Project01, fileName, data);

        // Throw the exception when saving the audio
        env.SFProjectService.SaveAudioAsync(User01, Project01, Data01, Arg.Any<string>())
            .Throws(new DataNotFoundException("The project does not exist."));

        // SUT
        IActionResult actual = await env.Controller.UploadAudioAsync();
        Assert.IsNotNull(actual);
        Assert.IsInstanceOf<NotFoundResult>(actual);
    }

    [Test]
    public async Task UploadAudioAsync_UnexpectedException()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload
        const string fileName = "test.mp3";
        const string data = "ID3";
        using HttpRequestMessage _ = await env.CreateSuccessfulFileUploadResultAsync(Data01, Project01, fileName, data);

        // Throw the exception when saving the audio
        env.SFProjectService.SaveAudioAsync(User01, Project01, Data01, Arg.Any<string>())
            .Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(env.Controller.UploadAudioAsync);
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task UploadAudioAsync_UploadFile()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload
        const string fileName = "test.mp3";
        const string data = "ID3";
        using HttpRequestMessage _ = await env.CreateSuccessfulFileUploadResultAsync(Data01, Project01, fileName, data);

        // Set up the URI to the uploaded file
        Uri relativeUri = new Uri(
            $"/assets/audio/{Project01}/{fileName}?t={DateTime.UtcNow.ToFileTime()}",
            UriKind.Relative
        );
        env.SFProjectService.SaveAudioAsync(User01, Project01, Data01, Arg.Any<string>()).Returns(relativeUri);

        // SUT
        IActionResult actual = await env.Controller.UploadAudioAsync();
        Assert.IsNotNull(actual);
        Assert.IsInstanceOf<CreatedResult>(actual);
        Assert.AreEqual(relativeUri.ToString(), (actual as CreatedResult)?.Location);
        Assert.AreEqual(fileName, (actual as CreatedResult)?.Value);
    }

    [Test]
    public async Task UploadTrainingDataAsync_EmptyRequestFails()
    {
        await using var env = new TestEnvironment();
        env.CreateEmptyRequest();

        // SUT
        IActionResult actual = await env.Controller.UploadTrainingDataAsync();
        Assert.IsInstanceOf<BadRequestResult>(actual);
    }

    [Test]
    public async Task UploadTrainingDataAsync_FileNotUploaded()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload
        using var request = await env.CreateFileUploadRequestAsync(Data01, Project01, fileName: null, fileStream: null);

        // SUT
        IActionResult actual = await env.Controller.UploadTrainingDataAsync();
        Assert.IsInstanceOf<BadRequestResult>(actual);
    }

    [Test]
    public async Task UploadTrainingDataAsync_DataIdUndefined()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload
        const string fileName = "test.csv";
        const string data = "Test,Data";
        using HttpRequestMessage _ = await env.CreateSuccessfulFileUploadResultAsync(
            "undefined",
            Project01,
            fileName,
            data
        );

        // SUT
        IActionResult actual = await env.Controller.UploadTrainingDataAsync();
        Assert.IsInstanceOf<BadRequestResult>(actual);
    }

    [Test]
    public async Task UploadTrainingDataAsync_Forbidden()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload
        const string fileName = "test.csv";
        const string data = "Test,Data";
        using HttpRequestMessage _ = await env.CreateSuccessfulFileUploadResultAsync(Data01, Project01, fileName, data);

        // Throw the exception when saving the training data
        env.TrainingDataService.SaveTrainingDataAsync(User01, Project01, Data01, Arg.Any<string>())
            .Throws(new ForbiddenException());

        // SUT
        IActionResult actual = await env.Controller.UploadTrainingDataAsync();
        Assert.IsNotNull(actual);
        Assert.IsInstanceOf<ForbidResult>(actual);
    }

    [Test]
    public async Task UploadTrainingDataAsync_NotFound()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload
        const string fileName = "test.csv";
        const string data = "Test,Data";
        using HttpRequestMessage _ = await env.CreateSuccessfulFileUploadResultAsync(Data01, Project01, fileName, data);

        // Throw the exception when saving the training data
        env.TrainingDataService.SaveTrainingDataAsync(User01, Project01, Data01, Arg.Any<string>())
            .Throws(new DataNotFoundException("The project does not exist."));

        // SUT
        IActionResult actual = await env.Controller.UploadTrainingDataAsync();
        Assert.IsNotNull(actual);
        Assert.IsInstanceOf<NotFoundResult>(actual);
    }

    [Test]
    public async Task UploadTrainingDataAsync_UnexpectedException()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload
        const string fileName = "test.csv";
        const string data = "Test,Data";
        using HttpRequestMessage _ = await env.CreateSuccessfulFileUploadResultAsync(Data01, Project01, fileName, data);

        // Throw the exception when saving the training data
        env.TrainingDataService.SaveTrainingDataAsync(User01, Project01, Data01, Arg.Any<string>())
            .Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(env.Controller.UploadTrainingDataAsync);
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task UploadTrainingDataAsync_UploadFile()
    {
        await using var env = new TestEnvironment();

        // Set up the file upload
        const string fileName = "test.csv";
        const string data = "Test,Data";
        using HttpRequestMessage _ = await env.CreateSuccessfulFileUploadResultAsync(Data01, Project01, fileName, data);

        // Set up the URI to the uploaded file
        Uri relativeUri = new Uri(
            $"/assets/{TrainingDataService.DirectoryName}/{Project01}/{fileName}?t={DateTime.UtcNow.ToFileTime()}",
            UriKind.Relative
        );
        env.TrainingDataService.SaveTrainingDataAsync(User01, Project01, Data01, Arg.Any<string>())
            .Returns(relativeUri);

        // SUT
        IActionResult actual = await env.Controller.UploadTrainingDataAsync();
        Assert.IsNotNull(actual);
        Assert.IsInstanceOf<CreatedResult>(actual);
        Assert.AreEqual(relativeUri.ToString(), (actual as CreatedResult)?.Location);
        Assert.AreEqual(fileName, (actual as CreatedResult)?.Value);

        // Verify clean up
        env.FileSystemService.Received(1).DeleteFile(Arg.Any<string>());
    }

    private class TestEnvironment : IAsyncDisposable
    {
        private readonly List<MemoryStream> _memoryStreams = [];

        public TestEnvironment()
        {
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            FileSystemService = Substitute.For<IFileSystemService>();
            var httpRequestAccessor = Substitute.For<IHttpRequestAccessor>();
            httpRequestAccessor.SiteRoot.Returns(new Uri("https://scriptureforge.org", UriKind.Absolute));
            SFProjectService = Substitute.For<ISFProjectService>();
            TrainingDataService = Substitute.For<ITrainingDataService>();
            var userAccessor = Substitute.For<IUserAccessor>();
            userAccessor.UserId.Returns(User01);
            userAccessor.SystemRoles.Returns(Roles);
            Controller = new SFProjectsUploadController(
                ExceptionHandler,
                FileSystemService,
                httpRequestAccessor,
                SFProjectService,
                TrainingDataService,
                userAccessor
            );
        }

        public SFProjectsUploadController Controller { get; }
        public IExceptionHandler ExceptionHandler { get; }
        public IFileSystemService FileSystemService { get; }
        public ITrainingDataService TrainingDataService { get; }
        public ISFProjectService SFProjectService { get; }

        public void CreateEmptyRequest()
        {
            var httpContext = new DefaultHttpContext();
            Controller.ControllerContext.HttpContext = httpContext;
        }

        /// <summary>
        /// Creates a file upload request, but not the temporary file on disk.
        /// </summary>
        /// <param name="dataId">The data identifier.</param>
        /// <param name="projectId">The SF project identifier.</param>
        /// <param name="fileName">The file name.</param>
        /// <param name="fileStream">The file stream.</param>
        /// <returns>The Http Request Message. This must be disposed.</returns>
        public async Task<HttpRequestMessage> CreateFileUploadRequestAsync(
            string? dataId,
            string? projectId,
            string? fileName,
            Stream? fileStream
        )
        {
            // Create the form content
            var content = new MultipartFormDataContent();

            // Add the data id if specified
            if (dataId is not null)
            {
                content.Add(new StringContent(dataId), "dataId");
            }

            // Set the file stream if specified
            if (fileStream is not null)
            {
                var streamContent = new StreamContent(fileStream);
                streamContent.Headers.ContentDisposition = new ContentDispositionHeaderValue("form-data")
                {
                    Name = "file",
                    FileName = fileName,
                };
                content.Add(streamContent, "file");
            }

            // Add the project id if specified
            if (projectId is not null)
            {
                content.Add(new StringContent(projectId), "projectId");
            }

            // Add form fields to a new request message
            var request = new HttpRequestMessage { Content = content };

            // Set up the HTTP context with this data
            Controller.ControllerContext.HttpContext = new DefaultHttpContext
            {
                Request =
                {
                    ContentLength = request.Content.Headers.ContentLength,
                    ContentType = request.Content.Headers.ContentType?.ToString(),
                    Body = await request.Content.ReadAsStreamAsync(),
                    Method = request.Method.Method,
                },
            };

            return request;
        }

        /// <summary>
        /// Creates a file upload request, and the temporary file on disk.
        /// </summary>
        /// <param name="dataId">The data identifier.</param>
        /// <param name="projectId">The SF project identifier.</param>
        /// <param name="fileName">The file name.</param>
        /// <param name="data">The file data.</param>
        /// <returns>The Http Request Message. This must be disposed.</returns>
        public async Task<HttpRequestMessage> CreateSuccessfulFileUploadResultAsync(
            string? dataId,
            string? projectId,
            string? fileName,
            string data
        )
        {
            // Set up the file upload
            MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes(data));
            HttpRequestMessage request = await CreateFileUploadRequestAsync(dataId, projectId, fileName, fileStream);

            // Set up the moving of the file
            MemoryStream outputStream = new MemoryStream();
            FileSystemService.CreateFile(Arg.Any<string>()).Returns(outputStream);

            // Trigger clean up of the temporary file
            FileSystemService.FileExists(Arg.Any<string>()).Returns(true);

            // Record the memory streams to retain scope and facilitate later disposal
            _memoryStreams.Add(fileStream);
            _memoryStreams.Add(outputStream);

            // Return the request so the outer scope can dispose it
            return request;
        }

        public async ValueTask DisposeAsync()
        {
            foreach (MemoryStream memoryStream in _memoryStreams)
            {
                await memoryStream.DisposeAsync();
            }
        }
    }
}
