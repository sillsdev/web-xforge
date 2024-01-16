using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using NPOI.HSSF.UserModel;
using NPOI.SS.UserModel;
using NPOI.XSSF.UserModel;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class TrainingDataServiceTests
{
    private const string Data01 = "507f1f77bcf86cd799439011";
    private const string FileCsv = "test.csv";
    private const string FileExcel2003 = "test.xls";
    private const string FileExcel2007 = "test.xlsx";
    private const string FileTsv = "test.tsv";
    private const string FileTxt = "test.txt";
    private const string Project01 = "project01";
    private const string User01 = "user01";
    private const string User02 = "user02";
    private const string User03 = "user03";

    [Test]
    public async Task SaveTrainingDataAsync_CorruptSpreadsheet()
    {
        var env = new TestEnvironment();

        // Create the input file
        await using MemoryStream fileStream = new MemoryStream();
        using IWorkbook workbook = new HSSFWorkbook();
        workbook.Write(fileStream, leaveOpen: true);
        fileStream.Seek(0, SeekOrigin.Begin);
        env.FileSystemService.OpenFile(FileExcel2003, FileMode.Open).Returns(fileStream);

        // SUT
        Assert.ThrowsAsync<FormatException>(
            () => env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileExcel2003)
        );
    }

    [Test]
    public async Task SaveTrainingDataAsync_EmptySpreadsheet()
    {
        var env = new TestEnvironment();

        // Create the input file
        await using MemoryStream fileStream = new MemoryStream();
        using IWorkbook workbook = new HSSFWorkbook();
        workbook.CreateSheet("Sheet1");
        workbook.Write(fileStream, leaveOpen: true);
        fileStream.Seek(0, SeekOrigin.Begin);
        env.FileSystemService.OpenFile(FileExcel2003, FileMode.Open).Returns(fileStream);

        // SUT
        Assert.ThrowsAsync<FormatException>(
            () => env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileExcel2003)
        );
    }

    [Test]
    public void SaveTrainingDataAsync_InvalidDataId()
    {
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<FormatException>(
            () => env.Service.SaveTrainingDataAsync(User01, Project01, "invalid_data_id", FileCsv)
        );
    }

    [Test]
    public void SaveTrainingDataAsync_InvalidFileExtensions()
    {
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<FormatException>(
            () => env.Service.SaveTrainingDataAsync(User01, Project01, Data01, "test.doc")
        );
    }

    [Test]
    public void SaveTrainingDataAsync_MissingProject()
    {
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.SaveTrainingDataAsync(User01, "invalid_project_id", Data01, FileCsv)
        );
    }

    [Test]
    public void SaveTrainingDataAsync_NoPermission()
    {
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.SaveTrainingDataAsync(User03, Project01, "invalid_data_id", FileCsv)
        );
    }

    [Test]
    public async Task SaveTrainingDataAsync_NotEnoughColumns()
    {
        var env = new TestEnvironment();

        // Set up the input file
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test"));
        env.FileSystemService.OpenFile(FileCsv, FileMode.Open).Returns(fileStream);

        // SUT
        Assert.ThrowsAsync<FormatException>(
            () => env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileCsv)
        );
    }

    [Test]
    public async Task SaveTrainingDataAsync_SupportsCsvFiles()
    {
        var env = new TestEnvironment();

        // Set up the input file
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test,Data"));
        env.FileSystemService.OpenFile(FileCsv, FileMode.Open).Returns(fileStream);

        // We will also check that the existing file is deleted
        env.FileSystemService.FileExists(Arg.Any<string>()).Returns(true);

        // SUT
        Uri actual = await env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileCsv);
        Assert.That(
            actual
                .ToString()
                .StartsWith(
                    $"http://localhost/assets/{TrainingDataService.DirectoryName}/{Project01}/{User01}_{Data01}.csv?t="
                ),
            Is.True
        );

        env.FileSystemService.Received(1).DeleteFile(Arg.Any<string>());
        env.FileSystemService.Received(1).MoveFile(Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public async Task SaveTrainingDataAsync_SupportsTsvFiles()
    {
        var env = new TestEnvironment();

        // Set up the input file
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test\tData"));
        env.FileSystemService.OpenFile(FileTsv, FileMode.Open).Returns(fileStream);

        // SUT
        Uri actual = await env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileTsv);
        Assert.That(
            actual
                .ToString()
                .StartsWith(
                    $"http://localhost/assets/{TrainingDataService.DirectoryName}/{Project01}/{User01}_{Data01}.csv?t="
                ),
            Is.True
        );

        env.FileSystemService.Received(1).MoveFile(Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public async Task SaveTrainingDataAsync_SupportsTxtFiles()
    {
        var env = new TestEnvironment();

        // Set up the input file
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test;Data"));
        env.FileSystemService.OpenFile(FileTxt, FileMode.Open).Returns(fileStream);

        // SUT
        Uri actual = await env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileTxt);
        Assert.That(
            actual
                .ToString()
                .StartsWith(
                    $"http://localhost/assets/{TrainingDataService.DirectoryName}/{Project01}/{User01}_{Data01}.csv?t="
                ),
            Is.True
        );

        env.FileSystemService.Received(1).MoveFile(Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public async Task SaveTrainingDataAsync_SupportsXlsFiles()
    {
        var env = new TestEnvironment();

        // Create the input file
        await using MemoryStream fileStream = new MemoryStream();
        using IWorkbook workbook = new HSSFWorkbook();
        ISheet sheet = workbook.CreateSheet("Sheet1");
        IRow row = sheet.CreateRow(0);
        row.CreateCell(0).SetCellValue("Test"); // A1
        row.CreateCell(1).SetCellValue("Data"); // A2
        workbook.Write(fileStream, leaveOpen: true);
        fileStream.Seek(0, SeekOrigin.Begin);
        env.FileSystemService.OpenFile(FileExcel2003, FileMode.Open).Returns(fileStream);

        // Create the output file
        string path = Path.Combine(
            env.SiteOptions.Value.SiteDir,
            TrainingDataService.DirectoryName,
            Project01,
            $"{User01}_{Data01}.csv"
        );
        await using NonDisposingMemoryStream outputStream = new NonDisposingMemoryStream();
        env.FileSystemService.CreateFile(path).Returns(outputStream);

        // SUT
        Uri actual = await env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileExcel2003);
        Assert.That(
            actual
                .ToString()
                .StartsWith(
                    $"http://localhost/assets/{TrainingDataService.DirectoryName}/{Project01}/{User01}_{Data01}.csv?t="
                ),
            Is.True
        );

        StreamReader reader = new StreamReader(outputStream);
        string text = await reader.ReadToEndAsync();
        text = text.TrimEnd(); // Remove trailing new lines
        Assert.AreEqual("Test,Data", text);
        outputStream.ForceDispose();
    }

    [Test]
    public async Task SaveTrainingDataAsync_SupportsXlsxFiles()
    {
        var env = new TestEnvironment();

        // Create the input file
        await using MemoryStream fileStream = new MemoryStream();
        using IWorkbook workbook = new XSSFWorkbook();
        ISheet sheet = workbook.CreateSheet("Output");
        IRow row = sheet.CreateRow(1);
        row.CreateCell(1).SetCellValue("Test"); // B2
        row.CreateCell(2).SetCellValue("Data"); // B3
        workbook.Write(fileStream, leaveOpen: true);
        fileStream.Seek(0, SeekOrigin.Begin);
        env.FileSystemService.OpenFile(FileExcel2007, FileMode.Open).Returns(fileStream);

        // Create the output file
        string path = Path.Combine(
            env.SiteOptions.Value.SiteDir,
            TrainingDataService.DirectoryName,
            Project01,
            $"{User01}_{Data01}.csv"
        );
        await using NonDisposingMemoryStream outputStream = new NonDisposingMemoryStream();
        env.FileSystemService.CreateFile(path).Returns(outputStream);

        // SUT
        Uri actual = await env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileExcel2007);
        Assert.That(
            actual
                .ToString()
                .StartsWith(
                    $"http://localhost/assets/{TrainingDataService.DirectoryName}/{Project01}/{User01}_{Data01}.csv?t="
                ),
            Is.True
        );

        StreamReader reader = new StreamReader(outputStream);
        string text = await reader.ReadToEndAsync();
        text = text.TrimEnd(); // Remove trailing new lines
        Assert.AreEqual("Test,Data", text);
        outputStream.ForceDispose();
    }

    [Test]
    public async Task SaveTrainingDataAsync_TooManyColumns()
    {
        var env = new TestEnvironment();

        // Set up the input file
        await using MemoryStream fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test,Data,More"));
        env.FileSystemService.OpenFile(FileCsv, FileMode.Open).Returns(fileStream);

        // SUT
        Assert.ThrowsAsync<FormatException>(
            () => env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileCsv)
        );
    }

    /// <summary>
    /// A memory stream that must be manually disposed.
    /// </summary>
    /// <remarks>This is only for use if your memory stream will be closed by a stream writer.</remarks>
    private sealed class NonDisposingMemoryStream : MemoryStream
    {
        /// <inheritdoc />
        protected override void Dispose(bool disposing)
        {
            // If the stream is open, reset it to the start
            if (CanSeek)
            {
                Flush();
                Seek(0, SeekOrigin.Begin);
            }
        }

        /// <summary>
        /// Force the disposal of this object.
        /// </summary>
        public void ForceDispose() => base.Dispose(true);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            SiteOptions = Substitute.For<IOptions<SiteOptions>>();
            SiteOptions.Value.Returns(
                new SiteOptions { Origin = new Uri("http://localhost/", UriKind.Absolute), SiteDir = "site-dir" }
            );
            FileSystemService = Substitute.For<IFileSystemService>();

            var projects = new MemoryRepository<SFProject>(
                new[]
                {
                    new SFProject
                    {
                        Id = Project01,
                        UserRoles = new Dictionary<string, string>
                        {
                            { User01, SFProjectRole.Administrator },
                            { User02, SFProjectRole.Translator },
                            { User03, SFProjectRole.Consultant },
                        },
                    },
                }
            );
            var realtimeService = new SFMemoryRealtimeService();
            realtimeService.AddRepository("sf_projects", OTType.Json0, projects);
            Service = new TrainingDataService(FileSystemService, realtimeService, SiteOptions);
        }

        public IFileSystemService FileSystemService { get; }
        public TrainingDataService Service { get; }
        public IOptions<SiteOptions> SiteOptions { get; }
    }
}
