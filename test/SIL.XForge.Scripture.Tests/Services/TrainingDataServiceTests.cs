using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
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
    private const string Data01 = "107f1f77bcf86cd799439011";
    private const string Data02 = "207f1f77bcf86cd799439012";
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
    public void DeleteTrainingDataAsync_InvalidDataId()
    {
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<FormatException>(() =>
            env.Service.DeleteTrainingDataAsync(User01, Project01, User01, "invalid_data_id")
        );
    }

    [Test]
    public void DeleteTrainingDataAsync_MissingProject()
    {
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.DeleteTrainingDataAsync(User01, "invalid_project_id", User01, Data01)
        );
    }

    [Test]
    public void DeleteTrainingDataAsync_NoPermission()
    {
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.DeleteTrainingDataAsync(User02, Project01, User01, Data01)
        );
    }

    [Test]
    public async Task DeleteTrainingDataAsync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Service.DeleteTrainingDataAsync(User01, Project01, User01, Data01);
        env.FileSystemService.Received().DeleteFile(Arg.Any<string>());
    }

    [Test]
    public async Task GetTextsAsync_DoesNotGenerateTextsIfTooFewColumns()
    {
        var env = new TestEnvironment();
        string[] dataIds = [Data01];
        List<ISFText> sourceTexts = [];
        List<ISFText> targetTexts = [];

        // Set up the training data files
        await using var fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Line1\nLine2"));
        env.FileSystemService.OpenFile(Arg.Is<string>(p => p.Contains(Data01)), FileMode.Open).Returns(fileStream);

        // SUT
        await env.Service.GetTextsAsync(User01, Project01, dataIds, sourceTexts, targetTexts);
        Assert.AreEqual(1, sourceTexts.Count);
        Assert.AreEqual(0, sourceTexts.First().Segments.Count());
    }

    [Test]
    public async Task GetTextsAsync_GeneratesSourceAndTargetTexts()
    {
        var env = new TestEnvironment();
        string[] dataIds = [Data01, Data02];
        List<ISFText> sourceTexts = [];
        List<ISFText> targetTexts = [];

        // Set up the training data files
        await using var fileStream1 = new MemoryStream(
            Encoding.UTF8.GetBytes("D1Source1,D1Target1\nD1Source2,D1Target2")
        );
        env.FileSystemService.OpenFile(Arg.Is<string>(p => p.Contains(Data01)), FileMode.Open).Returns(fileStream1);
        await using var fileStream2 = new MemoryStream(
            Encoding.UTF8.GetBytes("Source_Heading\tTarget_Heading\n\"D2 Source 1\"\t\"D2 Target 1\"")
        );
        env.FileSystemService.OpenFile(Arg.Is<string>(p => p.Contains(Data02)), FileMode.Open).Returns(fileStream2);

        // SUT
        await env.Service.GetTextsAsync(User01, Project01, dataIds, sourceTexts, targetTexts);
        Assert.AreEqual(2, sourceTexts.Count);
        Assert.AreEqual(2, sourceTexts.First().Segments.Count());
        Assert.AreEqual("001", sourceTexts.First().Segments.First().SegmentRef);
        Assert.AreEqual("D1Source1", sourceTexts.First().Segments.First().SegmentText);
        Assert.AreEqual("002", sourceTexts.First().Segments.Last().SegmentRef);
        Assert.AreEqual("D1Source2", sourceTexts.First().Segments.Last().SegmentText);
        Assert.AreEqual(1, sourceTexts.Last().Segments.Count());
        Assert.AreEqual("001", sourceTexts.Last().Segments.First().SegmentRef);
        Assert.AreEqual("D2 Source 1", sourceTexts.Last().Segments.First().SegmentText);
        Assert.AreEqual(2, targetTexts.Count);
        Assert.AreEqual(2, targetTexts.First().Segments.Count());
        Assert.AreEqual("001", targetTexts.First().Segments.First().SegmentRef);
        Assert.AreEqual("D1Target1", targetTexts.First().Segments.First().SegmentText);
        Assert.AreEqual("002", targetTexts.First().Segments.Last().SegmentRef);
        Assert.AreEqual("D1Target2", targetTexts.First().Segments.Last().SegmentText);
        Assert.AreEqual(1, targetTexts.Last().Segments.Count());
        Assert.AreEqual("001", targetTexts.Last().Segments.First().SegmentRef);
        Assert.AreEqual("D2 Target 1", targetTexts.Last().Segments.First().SegmentText);
    }

    [Test]
    public void GetTextsAsync_MissingProject()
    {
        var env = new TestEnvironment();
        string[] dataIds = [Data01];
        List<ISFText> sourceTexts = [];
        List<ISFText> targetTexts = [];

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetTextsAsync(User01, "invalid_project_id", dataIds, sourceTexts, targetTexts)
        );
    }

    [Test]
    public void GetTextsAsync_MissingTrainingDataDirectory()
    {
        var env = new TestEnvironment();
        string[] dataIds = [Data01];
        List<ISFText> sourceTexts = [];
        List<ISFText> targetTexts = [];
        env.FileSystemService.DirectoryExists(Arg.Any<string>()).Returns(false);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.GetTextsAsync(User01, Project01, dataIds, sourceTexts, targetTexts)
        );
    }

    [Test]
    public void GetTextsAsync_NoPermission()
    {
        var env = new TestEnvironment();
        string[] dataIds = [Data01];
        List<ISFText> sourceTexts = [];
        List<ISFText> targetTexts = [];

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.GetTextsAsync(User03, Project01, dataIds, sourceTexts, targetTexts)
        );
    }

    [Test]
    public async Task GetTextsAsync_SkipsMissingDataId()
    {
        var env = new TestEnvironment();
        string[] dataIds = ["missing_data_id"];
        List<ISFText> sourceTexts = [];
        List<ISFText> targetTexts = [];

        // SUT
        await env.Service.GetTextsAsync(User01, Project01, dataIds, sourceTexts, targetTexts);
        env.FileSystemService.DidNotReceive().FileExists(Arg.Any<string>());
        env.FileSystemService.DidNotReceive().OpenFile(Arg.Any<string>(), FileMode.Open);
    }

    [Test]
    public async Task GetTextsAsync_SkipsWhenFileNotFound()
    {
        var env = new TestEnvironment();
        env.FileSystemService.FileExists(Arg.Any<string>()).Returns(false);
        string[] dataIds = [Data01, Data02];
        List<ISFText> sourceTexts = [];
        List<ISFText> targetTexts = [];

        // SUT
        await env.Service.GetTextsAsync(User01, Project01, dataIds, sourceTexts, targetTexts);
        env.FileSystemService.Received().FileExists(Arg.Any<string>());
        env.FileSystemService.DidNotReceive().OpenFile(Arg.Any<string>(), FileMode.Open);
    }

    [Test]
    public async Task SaveTrainingDataAsync_CorruptSpreadsheet()
    {
        var env = new TestEnvironment();

        // Create the input file
        await using var fileStream = new MemoryStream();
        using var workbook = new HSSFWorkbook();
        workbook.Write(fileStream, leaveOpen: true);
        fileStream.Seek(0, SeekOrigin.Begin);
        env.FileSystemService.OpenFile(FileExcel2003, FileMode.Open).Returns(fileStream);

        // SUT
        Assert.ThrowsAsync<FormatException>(() =>
            env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileExcel2003)
        );
    }

    [Test]
    public async Task SaveTrainingDataAsync_EmptySpreadsheet()
    {
        var env = new TestEnvironment();

        // Create the input file
        await using var fileStream = new MemoryStream();
        using var workbook = new HSSFWorkbook();
        workbook.CreateSheet("Sheet1");
        workbook.Write(fileStream, leaveOpen: true);
        fileStream.Seek(0, SeekOrigin.Begin);
        env.FileSystemService.OpenFile(FileExcel2003, FileMode.Open).Returns(fileStream);

        // SUT
        Assert.ThrowsAsync<FormatException>(() =>
            env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileExcel2003)
        );
    }

    [Test]
    public void SaveTrainingDataAsync_InvalidDataId()
    {
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<FormatException>(() =>
            env.Service.SaveTrainingDataAsync(User01, Project01, "invalid_data_id", FileCsv)
        );
    }

    [Test]
    public void SaveTrainingDataAsync_InvalidFileExtensions()
    {
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<FormatException>(() =>
            env.Service.SaveTrainingDataAsync(User01, Project01, Data01, "test.doc")
        );
    }

    [Test]
    public void SaveTrainingDataAsync_MissingProject()
    {
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() =>
            env.Service.SaveTrainingDataAsync(User01, "invalid_project_id", Data01, FileCsv)
        );
    }

    [Test]
    public void SaveTrainingDataAsync_NoPermission()
    {
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() =>
            env.Service.SaveTrainingDataAsync(User03, Project01, Data01, FileCsv)
        );
    }

    [Test]
    public async Task SaveTrainingDataAsync_NotEnoughColumns()
    {
        var env = new TestEnvironment();

        // Set up the input file
        await using var fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test"));
        env.FileSystemService.OpenFile(FileCsv, FileMode.Open).Returns(fileStream);

        // SUT
        Assert.ThrowsAsync<FormatException>(() =>
            env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileCsv)
        );
    }

    [Test]
    public async Task SaveTrainingDataAsync_SupportsCsvFiles()
    {
        var env = new TestEnvironment();

        // Set up the input file
        await using var fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test,Data"));
        env.FileSystemService.OpenFile(FileCsv, FileMode.Open).Returns(fileStream);

        // We will also check that the directory is created
        env.FileSystemService.FileExists(Arg.Any<string>()).Returns(false);
        env.FileSystemService.DirectoryExists(Arg.Any<string>()).Returns(false);

        // SUT
        Uri actual = await env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileCsv);
        Assert.That(
            actual
                .ToString()
                .StartsWith($"/assets/{TrainingDataService.DirectoryName}/{Project01}/{User01}_{Data01}.csv?t="),
            Is.True
        );

        env.FileSystemService.Received(1).CreateDirectory(Arg.Any<string>());
        env.FileSystemService.DidNotReceive().DeleteFile(Arg.Any<string>());
        env.FileSystemService.Received(1).MoveFile(Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public async Task SaveTrainingDataAsync_SupportsTsvFiles()
    {
        var env = new TestEnvironment();

        // Set up the input file
        await using var fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test\tData"));
        env.FileSystemService.OpenFile(FileTsv, FileMode.Open).Returns(fileStream);

        // SUT
        Uri actual = await env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileTsv);
        Assert.That(
            actual
                .ToString()
                .StartsWith($"/assets/{TrainingDataService.DirectoryName}/{Project01}/{User01}_{Data01}.csv?t="),
            Is.True
        );

        env.FileSystemService.Received(1).DeleteFile(Arg.Any<string>());
        env.FileSystemService.Received(1).MoveFile(Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public async Task SaveTrainingDataAsync_SupportsTxtFiles()
    {
        var env = new TestEnvironment();

        // Set up the input file
        await using var fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test;Data"));
        env.FileSystemService.OpenFile(FileTxt, FileMode.Open).Returns(fileStream);

        // SUT
        Uri actual = await env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileTxt);
        Assert.That(
            actual
                .ToString()
                .StartsWith($"/assets/{TrainingDataService.DirectoryName}/{Project01}/{User01}_{Data01}.csv?t="),
            Is.True
        );

        env.FileSystemService.Received(1).MoveFile(Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public async Task SaveTrainingDataAsync_SupportsXlsFiles()
    {
        var env = new TestEnvironment();

        // Create the input file
        await using var fileStream = new MemoryStream();
        using var workbook = new HSSFWorkbook();
        ISheet sheet = workbook.CreateSheet("Sheet1");
        IRow row = sheet.CreateRow(0);
        row.CreateCell(0).SetCellValue("Test"); // A1
        row.CreateCell(1).SetCellValue("Data"); // A2
        workbook.Write(fileStream, leaveOpen: true);
        fileStream.Seek(0, SeekOrigin.Begin);
        env.FileSystemService.OpenFile(FileExcel2003, FileMode.Open).Returns(fileStream);

        // Create the output file
        string path = Path.Join(
            env.SiteOptions.Value.SiteDir,
            TrainingDataService.DirectoryName,
            Project01,
            $"{User01}_{Data01}.csv"
        );
        await using var outputStream = new NonDisposingMemoryStream();
        env.FileSystemService.CreateFile(path).Returns(outputStream);

        // SUT
        Uri actual = await env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileExcel2003);
        Assert.That(
            actual
                .ToString()
                .StartsWith($"/assets/{TrainingDataService.DirectoryName}/{Project01}/{User01}_{Data01}.csv?t="),
            Is.True
        );

        using var reader = new StreamReader(outputStream);
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
        await using var fileStream = new MemoryStream();
        using var workbook = new XSSFWorkbook();
        ISheet sheet = workbook.CreateSheet("Output");
        IRow row = sheet.CreateRow(1);
        row.CreateCell(1).SetCellValue("Test"); // B2
        row.CreateCell(2).SetCellValue("Data"); // B3
        workbook.Write(fileStream, leaveOpen: true);
        fileStream.Seek(0, SeekOrigin.Begin);
        env.FileSystemService.OpenFile(FileExcel2007, FileMode.Open).Returns(fileStream);

        // Create the output file
        string path = Path.Join(
            env.SiteOptions.Value.SiteDir,
            TrainingDataService.DirectoryName,
            Project01,
            $"{User01}_{Data01}.csv"
        );
        await using var outputStream = new NonDisposingMemoryStream();
        env.FileSystemService.CreateFile(path).Returns(outputStream);

        // SUT
        Uri actual = await env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileExcel2007);
        Assert.That(
            actual
                .ToString()
                .StartsWith($"/assets/{TrainingDataService.DirectoryName}/{Project01}/{User01}_{Data01}.csv?t="),
            Is.True
        );

        using var reader = new StreamReader(outputStream);
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
        await using var fileStream = new MemoryStream(Encoding.UTF8.GetBytes("Test,Data,More"));
        env.FileSystemService.OpenFile(FileCsv, FileMode.Open).Returns(fileStream);

        // SUT
        Assert.ThrowsAsync<FormatException>(() =>
            env.Service.SaveTrainingDataAsync(User01, Project01, Data01, FileCsv)
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
            SiteOptions.Value.Returns(new SiteOptions { SiteDir = "site-dir" });
            FileSystemService = Substitute.For<IFileSystemService>();
            FileSystemService.DirectoryExists(Arg.Any<string>()).Returns(true);

            // Check for a question mark to ensure the raw FileUrl from the TrainingData document is not specified
            FileSystemService.FileExists(Arg.Is<string>(f => f.Contains('?'))).Returns(false);
            FileSystemService.FileExists(Arg.Is<string>(f => !f.Contains('?'))).Returns(true);

            var projects = new MemoryRepository<SFProject>(
                [
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
                ]
            );
            var trainingData = new MemoryRepository<TrainingData>(
                [
                    new TrainingData
                    {
                        Id = TrainingData.GetDocId(Project01, Data01),
                        DataId = Data01,
                        ProjectRef = Project01,
                        OwnerRef = User01,
                        FileUrl = $"/{Project01}/{User01}_{Data01}.csv?t={DateTime.UtcNow.ToFileTime()}",
                        MimeType = "text/csv",
                        SkipRows = 0,
                    },
                    new TrainingData
                    {
                        Id = TrainingData.GetDocId(Project01, Data02),
                        DataId = Data02,
                        ProjectRef = Project01,
                        OwnerRef = User02,
                        FileUrl =
                            $"http://example.com/{Project01}/{User01}_{Data02}.csv?t={DateTime.UtcNow.ToFileTime()}",
                        MimeType = "text/csv",
                        SkipRows = 1,
                    },
                ]
            );
            var realtimeService = new SFMemoryRealtimeService();
            realtimeService.AddRepository("sf_projects", OTType.Json0, projects);
            realtimeService.AddRepository("training_data", OTType.Json0, trainingData);
            var projectRights = Substitute.For<ISFProjectRights>();
            projectRights
                .HasRight(Arg.Any<SFProject>(), User01, SFProjectDomain.TrainingData, Arg.Any<string>())
                .Returns(true);
            Service = new TrainingDataService(FileSystemService, realtimeService, projectRights, SiteOptions);
        }

        public IFileSystemService FileSystemService { get; }
        public TrainingDataService Service { get; }
        public IOptions<SiteOptions> SiteOptions { get; }
    }
}
