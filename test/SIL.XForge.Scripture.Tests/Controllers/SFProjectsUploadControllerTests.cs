using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
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
    private const string Role = SystemRole.User;

    [Test]
    public async Task UploadAudioAsync_EmptyRequestFails()
    {
        var env = new TestEnvironment();
        env.CreateEmptyRequest();

        // SUT
        IActionResult actual = await env.Controller.UploadAudioAsync();
        Assert.IsInstanceOf<BadRequestResult>(actual);
    }

    [Test]
    public async Task UploadAudioAsync_Forbidden()
    {
        var env = new TestEnvironment();

        // Set up the file upload
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("ID3"));
        const string fileName = "test.mp3";
        await env.CreateFileUploadRequest(Data01, Project01, fileName, fileStream);

        // Set up the moving of the file
        await using MemoryStream outputStream = new MemoryStream();
        env.FileSystemService.CreateFile(Arg.Any<string>()).Returns(outputStream);

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
        var env = new TestEnvironment();

        // Set up the file upload
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("ID3"));
        const string fileName = "test.mp3";
        await env.CreateFileUploadRequest(Data01, Project01, fileName, fileStream);

        // Set up the moving of the file
        await using MemoryStream outputStream = new MemoryStream();
        env.FileSystemService.CreateFile(Arg.Any<string>()).Returns(outputStream);

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
        var env = new TestEnvironment();

        // Set up the file upload
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("ID3"));
        const string fileName = "test.mp3";
        await env.CreateFileUploadRequest(Data01, Project01, fileName, fileStream);

        // Set up the moving of the file
        await using MemoryStream outputStream = new MemoryStream();
        env.FileSystemService.CreateFile(Arg.Any<string>()).Returns(outputStream);

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
        var env = new TestEnvironment();

        // Set up the file upload
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("ID3"));
        const string fileName = "test.mp3";
        await env.CreateFileUploadRequest(Data01, Project01, fileName, fileStream);

        // Set up the moving of the file
        await using MemoryStream outputStream = new MemoryStream();
        env.FileSystemService.CreateFile(Arg.Any<string>()).Returns(outputStream);
        env.FileSystemService.FileExists(Arg.Any<string>()).Returns(true);

        // Set up the URI to the uploaded file
        Uri baseUri = new Uri("https://scriptureforge.org/", UriKind.Absolute);
        Uri relativeUri = new Uri(
            $"/assets/audio/{Project01}/{fileName}?t={DateTime.UtcNow.ToFileTime()}",
            UriKind.Relative
        );
        env.SFProjectService.SaveAudioAsync(User01, Project01, Data01, Arg.Any<string>())
            .Returns(new Uri(baseUri, relativeUri));

        // SUT
        IActionResult actual = await env.Controller.UploadAudioAsync();
        Assert.IsNotNull(actual);
        Assert.IsInstanceOf<CreatedResult>(actual);
        Assert.AreEqual(relativeUri.ToString(), (actual as CreatedResult)?.Location);
        Assert.AreEqual(fileName, (actual as CreatedResult).Value);
    }

    [Test]
    public async Task UploadTrainingDataAsync_EmptyRequestFails()
    {
        var env = new TestEnvironment();
        env.CreateEmptyRequest();

        // SUT
        IActionResult actual = await env.Controller.UploadTrainingDataAsync();
        Assert.IsInstanceOf<BadRequestResult>(actual);
    }

    [Test]
    public async Task UploadTrainingDataAsync_FileNotUploaded()
    {
        var env = new TestEnvironment();

        // Set up the file upload
        await env.CreateFileUploadRequest(Data01, Project01, fileName: null, fileStream: null);

        // SUT
        IActionResult actual = await env.Controller.UploadTrainingDataAsync();
        Assert.IsInstanceOf<BadRequestResult>(actual);
    }

    [Test]
    public async Task UploadTrainingDataAsync_DataIdUndefined()
    {
        var env = new TestEnvironment();

        // Set up the file upload
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test,Data"));
        const string fileName = "test.csv";
        await env.CreateFileUploadRequest("undefined", Project01, fileName, fileStream);

        // Set up the moving of the file
        await using MemoryStream outputStream = new MemoryStream();
        env.FileSystemService.CreateFile(Arg.Any<string>()).Returns(outputStream);

        // SUT
        IActionResult actual = await env.Controller.UploadTrainingDataAsync();
        Assert.IsInstanceOf<BadRequestResult>(actual);
    }

    [Test]
    public async Task UploadTrainingDataAsync_Forbidden()
    {
        var env = new TestEnvironment();

        // Set up the file upload
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test,Data"));
        const string fileName = "test.csv";
        await env.CreateFileUploadRequest(Data01, Project01, fileName, fileStream);

        // Set up the moving of the file
        await using MemoryStream outputStream = new MemoryStream();
        env.FileSystemService.CreateFile(Arg.Any<string>()).Returns(outputStream);

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
        var env = new TestEnvironment();

        // Set up the file upload
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test,Data"));
        const string fileName = "test.csv";
        await env.CreateFileUploadRequest(Data01, Project01, fileName, fileStream);

        // Set up the moving of the file
        await using MemoryStream outputStream = new MemoryStream();
        env.FileSystemService.CreateFile(Arg.Any<string>()).Returns(outputStream);

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
        var env = new TestEnvironment();

        // Set up the file upload
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test,Data"));
        const string fileName = "test.csv";
        await env.CreateFileUploadRequest(Data01, Project01, fileName, fileStream);

        // Set up the moving of the file
        await using MemoryStream outputStream = new MemoryStream();
        env.FileSystemService.CreateFile(Arg.Any<string>()).Returns(outputStream);

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
        var env = new TestEnvironment();

        // Set up the file upload
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test,Data"));
        const string fileName = "test.csv";
        await env.CreateFileUploadRequest(Data01, Project01, fileName, fileStream);

        // Set up the moving of the file
        await using MemoryStream outputStream = new MemoryStream();
        env.FileSystemService.CreateFile(Arg.Any<string>()).Returns(outputStream);

        // Trigger clean up of the temporary file
        env.FileSystemService.FileExists(Arg.Any<string>()).Returns(true);

        // Set up the URI to the uploaded file
        Uri baseUri = new Uri("https://scriptureforge.org/", UriKind.Absolute);
        Uri relativeUri = new Uri(
            $"/assets/{TrainingDataService.DirectoryName}/{Project01}/{fileName}?t={DateTime.UtcNow.ToFileTime()}",
            UriKind.Relative
        );
        env.TrainingDataService.SaveTrainingDataAsync(User01, Project01, Data01, Arg.Any<string>())
            .Returns(new Uri(baseUri, relativeUri));

        // SUT
        IActionResult actual = await env.Controller.UploadTrainingDataAsync();
        Assert.IsNotNull(actual);
        Assert.IsInstanceOf<CreatedResult>(actual);
        Assert.AreEqual(relativeUri.ToString(), (actual as CreatedResult)?.Location);
        Assert.AreEqual(fileName, (actual as CreatedResult).Value);

        // Verify clean up
        env.FileSystemService.Received(1).DeleteFile(Arg.Any<string>());
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            FileSystemService = Substitute.For<IFileSystemService>();
            SFProjectService = Substitute.For<ISFProjectService>();
            TrainingDataService = Substitute.For<ITrainingDataService>();
            var userAccessor = Substitute.For<IUserAccessor>();
            userAccessor.UserId.Returns(User01);
            userAccessor.SystemRole.Returns(Role);
            Controller = new SFProjectsUploadController(
                ExceptionHandler,
                FileSystemService,
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

        public async Task CreateFileUploadRequest(string dataId, string projectId, string? fileName, Stream? fileStream)
        {
            // Create the form content
            var content = new MultipartFormDataContent
            {
                { new StringContent(dataId), "dataId" },
                { new StringContent(projectId), "projectId" },
            };

            // Set the file stream if specified
            if (fileStream is not null)
            {
                var streamContent = new StreamContent(fileStream);
                streamContent.Headers.ContentDisposition = new ContentDispositionHeaderValue("form-data")
                {
                    Name = "file",
                    FileName = fileName,
                };
                content = new MultipartFormDataContent
                {
                    { new StringContent(dataId), "dataId" },
                    { streamContent, "file" },
                    { new StringContent(projectId), "projectId" },
                };
            }

            // Add form fields to a new request message
            var request = new HttpRequestMessage { Content = content, };

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
        }
    }
}
