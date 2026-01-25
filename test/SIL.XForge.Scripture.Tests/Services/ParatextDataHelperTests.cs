using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.ProjectComments;
using Paratext.Data.ProjectFileAccess;
using Paratext.Data.ProjectSettingsAccess;
using Paratext.Data.Repository;
using SIL.WritingSystems;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using ParatextComment = Paratext.Data.ProjectComments.Comment;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class ParatextDataHelperTests
{
    private const string DefaultStylesheetFileName = "usfm.sty";
    private const string ParatextUser01 = "ParatextUser01";
    private const string ResourceId01 = "9bb76cd3e5a7f9b4";

    [Test]
    public void GetNotes_ReturnsMappedTagData()
    {
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(HexId.CreateNew().ToString());
        var commentManager = CommentManager.Get(scrText);
        var commentTags = new MockCommentTags(scrText);
        commentTags.InitializeTagList([5]);
        TestEnvironment.AddComment(scrText, "thread-01", "RUT 1:1", "Mapped tag", "5");

        // SUT
        IReadOnlyList<ParatextNote> notes = env.Service.GetNotes(commentManager, commentTags);

        Assert.AreEqual(1, notes.Count);
        ParatextNote note = notes[0];
        Assert.AreEqual("thread-01", note.Id);
        Assert.AreEqual("RUT 1:1", note.VerseRef);
        Assert.AreEqual(1, note.Comments.Count);
        ParatextNoteComment comment = note.Comments[0];
        Assert.AreEqual("<p>Mapped tag</p>", comment.Content);
        Assert.IsNotNull(comment.Tag);
        Assert.AreEqual(5, comment.Tag!.Id);
        Assert.AreEqual("tag5", comment.Tag!.Name);
        Assert.AreEqual("icon5", comment.Tag!.Icon);
    }

    [Test]
    public void GetNotes_SkipsUnknownTags()
    {
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(HexId.CreateNew().ToString());
        var commentManager = CommentManager.Get(scrText);
        var commentTags = new MockCommentTags(scrText);
        commentTags.InitializeTagList([5]);
        TestEnvironment.AddComment(scrText, "thread-02", "RUT 1:2", "Unknown tag", "6");

        // SUT
        IReadOnlyList<ParatextNote> notes = env.Service.GetNotes(commentManager, commentTags);

        Assert.AreEqual(1, notes.Count);
        ParatextNoteComment comment = notes[0].Comments[0];
        Assert.IsNull(comment.Tag);
        Assert.AreEqual("<p>Unknown tag</p>", comment.Content);
    }

    [Test]
    public void GetNotes_SkipsNegativeTagIds()
    {
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(HexId.CreateNew().ToString());
        var commentManager = CommentManager.Get(scrText);
        var commentTags = new MockCommentTags(scrText);
        commentTags.InitializeTagList([5]);
        TestEnvironment.AddComment(scrText, "thread-03", "RUT 1:3", "Negative tag id", "-3");

        // SUT
        IReadOnlyList<ParatextNote> notes = env.Service.GetNotes(commentManager, commentTags);

        Assert.AreEqual(1, notes.Count);
        ParatextNoteComment comment = notes[0].Comments[0];
        Assert.IsNull(comment.Tag);
        Assert.AreEqual("<p>Negative tag id</p>", comment.Content);
        Assert.AreEqual("RUT 1:3", notes[0].VerseRef);
    }

    [Test]
    public void GetNotes_SkipsThreadsWithOnlyDeletedComments()
    {
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(HexId.CreateNew().ToString());
        var commentManager = CommentManager.Get(scrText);
        var commentTags = new MockCommentTags(scrText);
        commentTags.InitializeTagList([5]);
        TestEnvironment.AddComment(scrText, "thread-04", "RUT 1:4", "Deleted", "5", deleted: true);

        // SUT
        IReadOnlyList<ParatextNote> notes = env.Service.GetNotes(commentManager, commentTags);

        Assert.AreEqual(0, notes.Count);
    }

    [Test]
    public void GetNotes_IncludesThreadsWithDeletedComments()
    {
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(HexId.CreateNew().ToString());
        var commentManager = CommentManager.Get(scrText);
        var commentTags = new MockCommentTags(scrText);
        commentTags.InitializeTagList([5]);
        TestEnvironment.AddComment(scrText, "thread-04", "RUT 1:4", "Deleted", "5", deleted: true);
        TestEnvironment.AddComment(scrText, "thread-04", "RUT 1:4", "Active", "5");

        // SUT
        IReadOnlyList<ParatextNote> notes = env.Service.GetNotes(commentManager, commentTags);

        Assert.AreEqual(1, notes.Count);
    }

    [Test]
    public void GetNotes_FiltersThreadsWithPredicate()
    {
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(HexId.CreateNew().ToString());
        var commentManager = CommentManager.Get(scrText);
        var commentTags = new MockCommentTags(scrText);
        commentTags.InitializeTagList([2]);
        TestEnvironment.AddComment(scrText, "thread-05", "RUT 1:5", "First", "2");
        TestEnvironment.AddComment(scrText, "thread-06", "RUT 1:6", "Second", "2");

        // SUT
        IReadOnlyList<ParatextNote> notes = env.Service.GetNotes(
            commentManager,
            commentTags,
            thread => string.Equals(thread.Id, "thread-06", StringComparison.Ordinal)
        );

        Assert.AreEqual(1, notes.Count);
        Assert.AreEqual("thread-06", notes[0].Id);
    }

    [Test]
    public void CommitVersionedText_Success()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(HexId.CreateNew().ToString());
        scrText.Permissions.CreateFirstAdminUser();

        // SUT
        Assert.DoesNotThrow(() => env.Service.CommitVersionedText(scrText, "comment text"));
    }

    [Test]
    public void CommitVersionedText_ThrowsExceptionIfObserver()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(HexId.CreateNew().ToString());
        scrText.Permissions.CreateUser(ParatextUser01); // A user is an observer by default

        // SUT
        Assert.Throws<InvalidOperationException>(() => env.Service.CommitVersionedText(scrText, "comment text"));
    }

    [Test]
    public async Task MigrateResourceIfRequired_DoesNotMigrateIfNotRequired()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(ResourceId01, false);

        // SUT
        await env.Service.MigrateResourceIfRequiredAsync(scrText, overrideLanguage: null, CancellationToken.None);

        env.MockFileSystemService.DidNotReceive().MoveFile(Arg.Any<string>(), Arg.Any<string>());
    }

    [Test]
    public async Task MigrateResourceIfRequiredAsync_MigrateLanguage()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(ResourceId01, paratext7: true);
        const string languageCode = "grc";
        LanguageId languageId = LanguageId.FromEthnologueCode(languageCode);
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith("ldml.xml"))).Returns(true);
        env.MockFileSystemService.FileExists(Arg.Is<string>(p => p.EndsWith(".ldml"))).Returns(false);

        // SUT
        await env.Service.MigrateResourceIfRequiredAsync(scrText, languageId, CancellationToken.None);

        Assert.AreEqual(languageCode, scrText.Settings.LanguageID.Code);
        env.MockFileSystemService.Received()
            .MoveFile(Arg.Is<string>(p => p.EndsWith("ldml.xml")), Arg.Is<string>(p => p.EndsWith(".ldml")));
    }

    [Test]
    public async Task MigrateResourceIfRequiredAsync_MigrateStylesheet()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(ResourceId01, paratext7: true);
        Assert.IsEmpty(scrText.Settings.DefaultStylesheetFileName);

        // SUT
        await env.Service.MigrateResourceIfRequiredAsync(scrText, overrideLanguage: null, CancellationToken.None);

        Assert.AreEqual(DefaultStylesheetFileName, scrText.Settings.DefaultStylesheetFileName);
    }

    [Test]
    public async Task MigrateResourceIfRequiredAsync_MigrateVersification()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(ResourceId01, paratext7: true);
        scrText.Settings.SetSetting(Setting.Versification, 17);

        string projectVrsFilePath = Path.Join(scrText.FullPath, "oth11.vrs");
        env.MockFileSystemService.EnumerateFiles(Arg.Any<string>(), "*.vrs").Returns([projectVrsFilePath]);

        // Populate the project versification file
        const string projectVrsFileContents =
            "# Project Versification File\r\n#\r\nPS2 1:20\r\nPS2 1:1-20 = PSA 151:1-20";
        await using MemoryStream projectVrsStream = new MemoryStream(
            Encoding.UTF8.GetBytes(projectVrsFileContents),
            false
        );
        projectVrsStream.Position = 0;
        env.MockFileSystemService.OpenFile(projectVrsFilePath, FileMode.Open, FileAccess.Read, FileShare.Read)
            .Returns(projectVrsStream);

        // Return a writable stream for the custom versification file
        string customVrsFilePath = Path.Join(scrText.FullPath, ParatextVersificationTable.customVersFilename);
        await using NonDisposingMemoryStream customVrsStream = new NonDisposingMemoryStream();
        env.MockFileSystemService.OpenFile(customVrsFilePath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.None)
            .Returns(customVrsStream);

        // SUT
        await env.Service.MigrateResourceIfRequiredAsync(scrText, overrideLanguage: null, CancellationToken.None);

        customVrsStream.Position = 0;
        const string expected = $"# Project Versification File\r\n\r\nPS2 1:20 END\r\nPS2 1:1-20 = PSA 151:1-20\r\n";
        string actual = Encoding.UTF8.GetString(customVrsStream.ToArray());
        Assert.AreEqual(expected, actual);
        Assert.AreEqual("1", scrText.Settings.GetSetting(Setting.Versification));
        customVrsStream.ForceDispose();
    }

    [Test]
    public async Task MigrateResourceIfRequiredAsync_MigrateVersification_WithCustomVersification()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(ResourceId01, paratext7: true);
        scrText.Settings.SetSetting(Setting.Versification, 17);

        string customVrsFilePath = Path.Join(scrText.FullPath, ParatextVersificationTable.customVersFilename);
        string projectVrsFilePath = Path.Join(scrText.FullPath, "oth11.vrs");
        env.MockFileSystemService.EnumerateFiles(Arg.Any<string>(), "*.vrs")
            .Returns([customVrsFilePath, projectVrsFilePath]);

        // Populate the custom versification file
        env.MockFileSystemService.FileExists(customVrsFilePath).Returns(true);
        const string customVrsFileContents = "# Custom Versification File\r\nJUD 1:50";
        env.MockFileSystemService.FileReadText(customVrsFilePath).Returns(customVrsFileContents);
        await using NonDisposingMemoryStream customVrsStream = new NonDisposingMemoryStream();
        env.MockFileSystemService.OpenFile(customVrsFilePath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.None)
            .Returns(customVrsStream);

        // Populate the project versification file
        const string projectVrsFileContents =
            "# Project Versification File\r\n#\r\nPS2 1:20\r\nPS2 1:1-20 = PSA 151:1-20";
        await using MemoryStream projectVrsStream = new MemoryStream(
            Encoding.UTF8.GetBytes(projectVrsFileContents),
            false
        );
        projectVrsStream.Position = 0;
        env.MockFileSystemService.OpenFile(projectVrsFilePath, FileMode.Open, FileAccess.Read, FileShare.Read)
            .Returns(projectVrsStream);

        // SUT
        await env.Service.MigrateResourceIfRequiredAsync(scrText, overrideLanguage: null, CancellationToken.None);

        customVrsStream.Position = 0;
        const string expected =
            $"# Project Versification File\r\n\r\nPS2 1:20 END\r\nPS2 1:1-20 = PSA 151:1-20\r\n{customVrsFileContents}";
        string actual = Encoding.UTF8.GetString(customVrsStream.ToArray());
        Assert.AreEqual(expected, actual);
        Assert.AreEqual("1", scrText.Settings.GetSetting(Setting.Versification));
        customVrsStream.ForceDispose();
    }

    [Test]
    public async Task MigrateResourceIfRequiredAsync_MigrateVersification_MissingVersificationFile()
    {
        // Setup
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(ResourceId01, paratext7: true);
        const int versification = 17;
        scrText.Settings.SetSetting(Setting.Versification, versification);

        // SUT
        await env.Service.MigrateResourceIfRequiredAsync(scrText, overrideLanguage: null, CancellationToken.None);

        Assert.AreEqual(versification.ToString(), scrText.Settings.GetSetting(Setting.Versification));
    }

    private class TestEnvironment
    {
        private readonly string _syncDir = Path.GetTempPath();

        public TestEnvironment()
        {
            // Ensure that the SLDR is initialized for LanguageID.Code to be retrieved correctly
            if (!Sldr.IsInitialized)
                Sldr.Initialize(true);

            // Setup Mercurial for tests
            Hg.DefaultRunnerCreationFunc = (_, _, _) => new MockHgRunner();
            Hg.Default = new MockHg();
            VersionedText.AllCommitsDisabled = true;

            // Set up the service
            MockFileSystemService = Substitute.For<IFileSystemService>();
            Service = new ParatextDataHelper(MockFileSystemService);
        }

        public IFileSystemService MockFileSystemService { get; }

        public ParatextDataHelper Service { get; }

        public static void AddComment(
            ScrText scrText,
            string threadId,
            string verseRef,
            string content,
            string? tagValue,
            bool deleted = false
        )
        {
            XmlDocument doc = new XmlDocument();
            XmlElement root = doc.CreateElement("content");
            XmlElement paragraph = doc.CreateElement("p");
            paragraph.InnerText = content;
            root.AppendChild(paragraph);
            doc.AppendChild(root);

            var comment = new ParatextComment(scrText.User)
            {
                Thread = threadId,
                VerseRefStr = verseRef,
                Contents = root,
                DateTime = DateTimeOffset.UtcNow,
                Deleted = deleted,
                SelectedText = string.Empty,
                StartPosition = 0,
            };
            if (tagValue != null)
                comment.TagsAdded = [tagValue];
            CommentManager.Get(scrText).AddComment(comment);
        }

        /// <summary>
        /// Gets a mock scripture text for testing.
        /// </summary>
        /// <param name="paratextId">The Paratext project identifier.</param>
        /// <param name="paratext7">Optional. If <c>true</c>, the project should be in Paratext 7.0 format.</param>
        /// <returns>The mock scripture text.</returns>
        public MockScrText GetScrText(string paratextId, bool paratext7 = false)
        {
            string scrTextDir = Path.Join(_syncDir, paratextId, "target");
            ProjectName projectName = new ProjectName { ProjectPath = scrTextDir, ShortName = "Proj" };
            var scrText = new MockScrText(new SFParatextUser(ParatextUser01), projectName)
            {
                CachedGuid = HexId.FromStr(paratextId),
            };
            scrText.Settings.LanguageID = LanguageId.English;
            scrText.Settings.FileNamePostPart = ".SFM";
            if (!paratext7)
            {
                scrText.Settings.DefaultStylesheetFileName = DefaultStylesheetFileName;
            }

            // Set up the file manager for the comment manager
            ProjectFileManager fileManager = Substitute.For<ProjectFileManager>(scrText, null);
            fileManager.IsWritable.Returns(true);
            scrText.SetFileManager(fileManager);

            return scrText;
        }
    }
}
