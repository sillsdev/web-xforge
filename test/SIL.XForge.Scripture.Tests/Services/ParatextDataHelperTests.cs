using System;
using System.Collections.Generic;
using System.IO;
using System.Xml;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.ProjectComments;
using Paratext.Data.ProjectFileAccess;
using Paratext.Data.Repository;
using SIL.WritingSystems;
using SIL.XForge.Scripture.Models;
using ParatextComment = Paratext.Data.ProjectComments.Comment;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class ParatextDataHelperTests
{
    private const string ParatextUser01 = "ParatextUser01";

    [Test]
    public void GetNotes_ReturnsMappedTagData()
    {
        var env = new NotesTestEnvironment();
        env.CommentTags.InitializeTagList([5]);
        env.AddComment("thread-01", "RUT 1:1", "Mapped tag", "5");
        var helper = new ParatextDataHelper();

        IReadOnlyList<ParatextNote> notes = helper.GetNotes(env.CommentManager, env.CommentTags);

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
    public void GetNotes_SkipsThreadsWithOnlyDeletedComments()
    {
        var env = new NotesTestEnvironment();
        env.CommentTags.InitializeTagList([5]);
        env.AddComment("thread-04", "RUT 1:4", "Deleted", "5", deleted: true);
        var helper = new ParatextDataHelper();

        IReadOnlyList<ParatextNote> notes = helper.GetNotes(env.CommentManager, env.CommentTags);

        Assert.AreEqual(0, notes.Count);
    }

    [Test]
    public void GetNotes_IncludesThreadsWithDeletedComments()
    {
        var env = new NotesTestEnvironment();
        env.CommentTags.InitializeTagList([5]);
        env.AddComment("thread-04", "RUT 1:4", "Deleted", "5", deleted: true);
        env.AddComment("thread-04", "RUT 1:4", "Active", "5");
        var helper = new ParatextDataHelper();

        IReadOnlyList<ParatextNote> notes = helper.GetNotes(env.CommentManager, env.CommentTags);

        Assert.AreEqual(1, notes.Count);
    }

    [Test]
    public void GetNotes_FiltersThreadsWithPredicate()
    {
        var env = new NotesTestEnvironment();
        env.CommentTags.InitializeTagList([2]);
        env.AddComment("thread-05", "RUT 1:5", "First", "2");
        env.AddComment("thread-06", "RUT 1:6", "Second", "2");
        var helper = new ParatextDataHelper();

        IReadOnlyList<ParatextNote> notes = helper.GetNotes(
            env.CommentManager,
            env.CommentTags,
            thread => string.Equals(thread.Id, "thread-06", StringComparison.Ordinal)
        );

        Assert.AreEqual(1, notes.Count);
        Assert.AreEqual("thread-06", notes[0].Id);
    }

    [Test]
    public void CommitVersionedText_Success()
    {
        // Setup
        var env = new CommitTestEnvironment();
        using MockScrText scrText = new MockScrText(new SFParatextUser(ParatextUser01), new ProjectName());
        scrText.CachedGuid = HexId.CreateNew();
        scrText.Permissions.CreateFirstAdminUser();

        // SUT
        Assert.DoesNotThrow(() => env.Service.CommitVersionedText(scrText, "comment text"));
    }

    [Test]
    public void CommitVersionedText_ThrowsExceptionIfObserver()
    {
        // Setup
        var env = new CommitTestEnvironment();
        using MockScrText scrText = new MockScrText(new SFParatextUser(ParatextUser01), new ProjectName());
        scrText.Permissions.CreateUser(ParatextUser01); // A user is an observer by default

        // SUT
        Assert.Throws<InvalidOperationException>(() => env.Service.CommitVersionedText(scrText, "comment text"));
    }

    private sealed class CommitTestEnvironment
    {
        public CommitTestEnvironment()
        {
            // Ensure that the SLDR is initialized for LanguageID.Code to be retrieved correctly
            if (!Sldr.IsInitialized)
                Sldr.Initialize(true);

            // Setup Mercurial for tests
            Hg.DefaultRunnerCreationFunc = (_, _, _) => new MockHgRunner();
            Hg.Default = new MockHg();
            VersionedText.AllCommitsDisabled = true;
        }

        public ParatextDataHelper Service { get; } = new ParatextDataHelper();
    }

    private sealed class NotesTestEnvironment
    {
        private readonly string _ptProjectId;

        public NotesTestEnvironment()
        {
            // Ensure that the SLDR is initialized for LanguageID.Code to be retrieved correctly
            if (!Sldr.IsInitialized)
                Sldr.Initialize(true);

            Username = "User 01";
            _ptProjectId = Guid.NewGuid().ToString("N");
            string projectPath = Path.Join(Path.GetTempPath(), _ptProjectId, "target");
            ParatextUser = new SFParatextUser(Username);
            ProjectName projectName = new ProjectName { ProjectPath = projectPath, ShortName = "Proj" };
            ScrText = new MockScrText(ParatextUser, projectName) { CachedGuid = HexId.FromStr(_ptProjectId) };
            ScrText.Permissions.CreateFirstAdminUser();
            ProjectFileManager fileManager = Substitute.For<ProjectFileManager>(ScrText, null);
            fileManager.IsWritable.Returns(true);
            ScrText.SetFileManager(fileManager);
            CommentManager = CommentManager.Get(ScrText);
            CommentTags = MockCommentTags.GetCommentTags(Username, _ptProjectId);
        }

        public string Username { get; }
        public SFParatextUser ParatextUser { get; }
        public MockScrText ScrText { get; }
        public CommentManager CommentManager { get; }
        public MockCommentTags CommentTags { get; }

        public void AddComment(string threadId, string verseRef, string content, string? tagValue, bool deleted = false)
        {
            XmlDocument doc = new XmlDocument();
            XmlElement root = doc.CreateElement("content");
            XmlElement paragraph = doc.CreateElement("p");
            paragraph.InnerText = content;
            root.AppendChild(paragraph);
            doc.AppendChild(root);

            var comment = new ParatextComment(ParatextUser)
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
            CommentManager.AddComment(comment);
        }
    }
}
