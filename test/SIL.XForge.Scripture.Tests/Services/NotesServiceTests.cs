using System;
using System.Collections.Generic;
using System.IO;
using System.Xml;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.ProjectComments;
using Paratext.Data.ProjectFileAccess;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// Unit tests for <see cref="NotesService"/> covering note and tag mapping behaviour.
/// </summary>
[TestFixture]
public class NotesServiceTests
{
    [Test]
    public void GetNotes_ReturnsMappedTagData()
    {
        var env = new TestEnvironment();
        env.CommentTags.InitializeTagList([5]);
        env.AddComment("thread-01", "RUT 1:1", "Mapped tag", "5");
        var service = new NotesService();

        IReadOnlyList<ParatextNote> notes = service.GetNotes(env.CommentManager, env.CommentTags);

        Assert.AreEqual(1, notes.Count);
        ParatextNote note = notes[0];
        Assert.AreEqual("thread-01", note.Id);
        Assert.AreEqual("RUT 1:1", note.VerseRef);
        Assert.AreEqual(1, note.Comments.Count);
        ParatextNoteComment comment = note.Comments[0];
        Assert.AreEqual("<p>Mapped tag</p>", comment.Content);
        Assert.IsNotNull(comment.Tag);
        Assert.AreEqual(5, comment.Tag.Id);
        Assert.AreEqual("tag5", comment.Tag!.Name);
        Assert.AreEqual("icon5", comment.Tag!.Icon);
    }

    [Test]
    public void GetNotes_SkipsThreadsWithOnlyDeletedComments()
    {
        var env = new TestEnvironment();
        env.CommentTags.InitializeTagList([5]);
        env.AddComment("thread-04", "RUT 1:4", "Deleted", "5", deleted: true);
        var service = new NotesService();

        IReadOnlyList<ParatextNote> notes = service.GetNotes(env.CommentManager, env.CommentTags);

        Assert.AreEqual(0, notes.Count);
    }

    [Test]
    public void GetNotes_IncludesThreadsWithDeletedComments()
    {
        var env = new TestEnvironment();
        env.CommentTags.InitializeTagList([5]);
        env.AddComment("thread-04", "RUT 1:4", "Deleted", "5", deleted: true);
        env.AddComment("thread-04", "RUT 1:4", "Active", "5");
        var service = new NotesService();

        IReadOnlyList<ParatextNote> notes = service.GetNotes(env.CommentManager, env.CommentTags);

        Assert.AreEqual(1, notes.Count);
    }

    [Test]
    public void GetNotes_FiltersThreadsWithPredicate()
    {
        var env = new TestEnvironment();
        env.CommentTags.InitializeTagList([2]);
        env.AddComment("thread-05", "RUT 1:5", "First", "2");
        env.AddComment("thread-06", "RUT 1:6", "Second", "2");
        var service = new NotesService();

        IReadOnlyList<ParatextNote> notes = service.GetNotes(
            env.CommentManager,
            env.CommentTags,
            thread => string.Equals(thread.Id, "thread-06", StringComparison.Ordinal)
        );

        Assert.AreEqual(1, notes.Count);
        Assert.AreEqual("thread-06", notes[0].Id);
    }

    /// <summary>
    /// Provides minimal Paratext setup to exercise <see cref="NotesService"/> against real comment threads.
    /// </summary>
    private sealed class TestEnvironment
    {
        private readonly string _ptProjectId;

        public TestEnvironment()
        {
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

            var comment = new Paratext.Data.ProjectComments.Comment(ParatextUser)
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
