using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Xml;
using System.Xml.Linq;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.ProjectComments;
using Paratext.Data.ProjectFileAccess;
using Paratext.Data.Users;
using SIL.Scripture;
using SIL.XForge.Scripture.Models;
using Comment = Paratext.Data.ProjectComments.Comment;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class NotesFormatterTests
{
    [Test]
    public void FormatNotes_CommentText()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        const string xml = "<content>Comment Contents</content>";
        XmlDocument doc = new XmlDocument();
        doc.LoadXml(xml);
        Comment comment = new Comment(associatedPtUser)
        {
            Contents = doc.DocumentElement,
            DateTime = DateTimeOffset.Now,
            Thread = "Answer_dataId0123",
            VerseRefStr = "RUT 1:1",
        };
        List<CommentThread> commentThreads = new List<CommentThread>
        {
            new CommentThread
            {
                ContextScrTextName = env.ProjectScrText?.Name,
                ScrText = env.ProjectScrText,
                Comments = new List<Comment> { comment },
            },
        };

        // We use StringBuilder so we can have the environment specific new line
        StringBuilder sb = new StringBuilder();
        sb.AppendLine("<notes version=\"1.1\">");
        sb.AppendLine($"  <thread id=\"{comment.Thread}\">");
        sb.AppendLine($"    <selection verseRef=\"{comment.VerseRefStr}\" startPos=\"0\" selectedText=\"\" />");
        sb.AppendLine($"    <comment user=\"{env.Username01}\" date=\"{comment.DateTime:o}\">");
        sb.AppendLine("      <content>Comment Contents</content>");
        sb.AppendLine("    </comment>");
        sb.AppendLine("  </thread>");
        sb.Append("</notes>");
        string expected = sb.ToString();

        // SUT
        string actual = NotesFormatter.FormatNotes(commentThreads);
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void FormatNotes_ComplexComment()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        const string xml = "<content><p>Comment Contents</p></content>";
        XmlDocument doc = new XmlDocument();
        doc.LoadXml(xml);
        Comment comment = new Comment(associatedPtUser)
        {
            ContextAfter = "here.",
            ContextBefore = "Verse",
            Contents = doc.DocumentElement,
            DateTime = DateTimeOffset.Now,
            ExternalUser = "John Doe",
            SelectedText = "one",
            StartPosition = 1,
            Thread = "Answer_dataId0123",
            Type = NoteType.Conflict,
            VerseRefStr = "RUT 1:1",
        };
        List<CommentThread> commentThreads = new List<CommentThread>
        {
            new CommentThread
            {
                ContextScrTextName = env.ProjectScrText?.Name,
                ScrText = env.ProjectScrText,
                Comments = new List<Comment> { comment },
            },
        };

        // We use StringBuilder so we can have the environment specific new line
        StringBuilder sb = new StringBuilder();
        sb.AppendLine("<notes version=\"1.1\">");
        sb.AppendLine($"  <thread id=\"{comment.Thread}\" type=\"conflict\">");
        sb.Append($"    <selection verseRef=\"{comment.VerseRefStr}\" startPos=\"{comment.StartPosition}\"");
        sb.Append($" selectedText=\"{comment.SelectedText}\" beforeContext=\"{comment.ContextBefore}\"");
        sb.AppendLine($" afterContext=\"{comment.ContextAfter}\" />");
        sb.Append($"    <comment user=\"{env.Username01}\" date=\"{comment.DateTime:o}\"");
        sb.AppendLine($" extUser=\"{comment.ExternalUser}\">");
        sb.AppendLine("      <content>");
        sb.AppendLine("        <p>Comment Contents</p>");
        sb.AppendLine("      </content>");
        sb.AppendLine("    </comment>");
        sb.AppendLine("  </thread>");
        sb.Append("</notes>");
        string expected = sb.ToString();

        // SUT
        string actual = NotesFormatter.FormatNotes(commentThreads);
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void FormatNotes_DeletedComment()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        const string expected = "<notes version=\"1.1\" />";
        List<CommentThread> commentThreads = new List<CommentThread>
        {
            new CommentThread
            {
                ContextScrTextName = env.ProjectScrText?.Name,
                ScrText = env.ProjectScrText,
                Comments = new List<Comment>
                {
                    new Comment(associatedPtUser)
                    {
                        DateTime = DateTimeOffset.Now,
                        Deleted = true,
                        Thread = "Answer_dataId0123",
                        VerseRefStr = "RUT 1:1",
                    },
                },
            },
        };

        // SUT
        string actual = NotesFormatter.FormatNotes(commentThreads);
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void FormatNotes_DetailedCommentContents()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        string xml = "<content><p>Comment Text<bold>Bold Text</bold><italic>Italic Text</italic>";
        xml += "<language name=\"en_NZ\">Test</language></p></content>";
        XmlDocument doc = new XmlDocument();
        doc.LoadXml(xml);
        Comment comment = new Comment(associatedPtUser)
        {
            Contents = doc.DocumentElement,
            DateTime = DateTimeOffset.Now,
            Thread = "Answer_dataId0123",
            VerseRefStr = "RUT 1:1",
        };
        List<CommentThread> commentThreads = new List<CommentThread>
        {
            new CommentThread
            {
                ContextScrTextName = env.ProjectScrText?.Name,
                ScrText = env.ProjectScrText,
                Comments = new List<Comment> { comment },
            },
        };

        // We use StringBuilder so we can have the environment specific new line
        StringBuilder sb = new StringBuilder();
        sb.AppendLine("<notes version=\"1.1\">");
        sb.AppendLine($"  <thread id=\"{comment.Thread}\">");
        sb.AppendLine($"    <selection verseRef=\"{comment.VerseRefStr}\" startPos=\"0\" selectedText=\"\" />");
        sb.AppendLine($"    <comment user=\"{env.Username01}\" date=\"{comment.DateTime:o}\">");
        sb.AppendLine("      <content>");
        sb.Append("        <p>Comment Text<span style=\"bold\">Bold Text</span>");
        sb.AppendLine("<span style=\"italic\">Italic Text</span><lang name=\"en_NZ\">Test</lang></p>");
        sb.AppendLine("      </content>");
        sb.AppendLine("    </comment>");
        sb.AppendLine("  </thread>");
        sb.Append("</notes>");
        string expected = sb.ToString();

        // SUT
        string actual = NotesFormatter.FormatNotes(commentThreads);
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void FormatNotes_SingleNodeContentParagraph()
    {
        // Setup test environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        const string thread = "Answer_dataId0123";
        const string verseRefStr = "RUT 1:1";
        DateTimeOffset commentDate = DateTimeOffset.Now;

        // We user StringBuilder so we can have the environment specific new line
        StringBuilder sb = new StringBuilder();
        sb.AppendLine("<notes version=\"1.1\">");
        sb.AppendLine($"  <thread id=\"{thread}\">");
        sb.AppendLine($"    <selection verseRef=\"{verseRefStr}\" startPos=\"0\" selectedText=\"\" />");
        sb.AppendLine($"    <comment user=\"{env.Username01}\" date=\"{commentDate:o}\">");
        sb.AppendLine("      <content>");
        sb.AppendLine("        <p>");
        sb.AppendLine("          <span style=\"bold\">Question text</span>");
        sb.AppendLine("        </p>");
        sb.AppendLine("        <p>Answer text</p>");
        sb.AppendLine("      </content>");
        sb.AppendLine("    </comment>");
        sb.AppendLine("  </thread>");
        sb.Append("</notes>");
        string expected = sb.ToString();

        // Setup the test data with paragraph elements with a single child node
        string xml = "<content><p><bold>Question text</bold></p>";
        xml += "<p>Answer text</p></content>";
        XmlDocument doc = new XmlDocument();
        doc.LoadXml(xml);
        var comment = new Comment(associatedPtUser)
        {
            DateTime = commentDate,
            Thread = thread,
            VerseRefStr = verseRefStr,
            Contents = doc.DocumentElement,
        };
        List<CommentThread> commentThreads = new List<CommentThread>
        {
            new CommentThread
            {
                ContextScrTextName = env.ProjectScrText?.Name,
                ScrText = env.ProjectScrText,
                Comments = new List<Comment> { comment },
            },
        };

        // SUT
        string actual = NotesFormatter.FormatNotes(commentThreads);
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void FormatNotes_EmptyComment()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        const string thread = "Answer_dataId0123";
        const string verseRefStr = "RUT 1:1";
        DateTimeOffset commentDate = DateTimeOffset.Now;

        // We use StringBuilder so we can have the environment specific new line
        StringBuilder sb = new StringBuilder();
        sb.AppendLine("<notes version=\"1.1\">");
        sb.AppendLine($"  <thread id=\"{thread}\">");
        sb.AppendLine($"    <selection verseRef=\"{verseRefStr}\" startPos=\"0\" selectedText=\"\" />");
        sb.AppendLine($"    <comment user=\"{env.Username01}\" date=\"{commentDate:o}\">");
        sb.AppendLine("      <content>");
        sb.AppendLine("        <p></p>");
        sb.AppendLine("      </content>");
        sb.AppendLine("    </comment>");
        sb.AppendLine("  </thread>");
        sb.Append("</notes>");
        string expected = sb.ToString();
        List<CommentThread> commentThreads = new List<CommentThread>
        {
            new CommentThread
            {
                ContextScrTextName = env.ProjectScrText?.Name,
                ScrText = env.ProjectScrText,
                Comments = new List<Comment>
                {
                    new Comment(associatedPtUser)
                    {
                        DateTime = commentDate,
                        Thread = thread,
                        VerseRefStr = verseRefStr,
                    },
                },
            },
        };

        // SUT
        string actual = NotesFormatter.FormatNotes(commentThreads);
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void FormatNotes_MultipleComments()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var firstPtUser = new SFParatextUser(env.Username01);
        var secondPtUser = new SFParatextUser(env.Username02);
        env.SetupProject(env.Project01, firstPtUser);

        // Setup the test data
        const string thread = "Answer_dataId0123";
        const string verseRefStr = "RUT 1:1";
        DateTimeOffset firstCommentDate = DateTimeOffset.Now.AddDays(-1);
        DateTimeOffset secondCommentDate = DateTimeOffset.Now;
        const string xml = "<content><p>Comment Contents</p></content>";
        XmlDocument doc = new XmlDocument();
        doc.LoadXml(xml);

        // We use StringBuilder so we can have the environment specific new line
        StringBuilder sb = new StringBuilder();
        sb.AppendLine("<notes version=\"1.1\">");
        sb.AppendLine($"  <thread id=\"{thread}\">");
        sb.AppendLine($"    <selection verseRef=\"{verseRefStr}\" startPos=\"0\" selectedText=\"\" />");
        sb.AppendLine($"    <comment user=\"{env.Username01}\" date=\"{firstCommentDate:o}\">");
        sb.AppendLine("      <content>");
        sb.AppendLine("        <p></p>");
        sb.AppendLine("      </content>");
        sb.AppendLine("    </comment>");
        sb.AppendLine($"    <comment user=\"{env.Username02}\" date=\"{secondCommentDate:o}\">");
        sb.AppendLine("      <content>");
        sb.AppendLine("        <p>Comment Contents</p>");
        sb.AppendLine("      </content>");
        sb.AppendLine("    </comment>");
        sb.AppendLine("  </thread>");
        sb.Append("</notes>");
        string expected = sb.ToString();
        List<CommentThread> commentThreads = new List<CommentThread>
        {
            new CommentThread
            {
                ContextScrTextName = env.ProjectScrText?.Name,
                ScrText = env.ProjectScrText,
                Comments = new List<Comment>
                {
                    new Comment(firstPtUser)
                    {
                        DateTime = firstCommentDate,
                        Thread = thread,
                        VerseRefStr = verseRefStr,
                    },
                    new Comment(secondPtUser)
                    {
                        DateTime = secondCommentDate,
                        Thread = thread,
                        VerseRefStr = verseRefStr,
                        Contents = doc.DocumentElement,
                    },
                },
            },
        };

        // SUT
        string actual = NotesFormatter.FormatNotes(commentThreads);
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void FormatNotes_NoComments()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        const string expected = "<notes version=\"1.1\" />";
        List<CommentThread> commentThreads = new List<CommentThread>
        {
            new CommentThread { ContextScrTextName = env.ProjectScrText?.Name, ScrText = env.ProjectScrText },
        };

        // SUT
        string actual = NotesFormatter.FormatNotes(commentThreads);
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void ParseNotes_CommentText()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        string commentText = "Comment Contents";
        DateTimeOffset commentDate = DateTimeOffset.Now;
        string thread = "Answer_dataId0123";
        string verseRefStr = "RUT 1:2";
        string xml = $"<notes version=\"1.1\"><thread id=\"{thread}\">";
        xml += $"<selection verseRef=\"{verseRefStr}\" startPos=\"0\" selectedText=\"\" />";
        xml += $"<comment user=\"{env.Username01}\" date=\"{commentDate:o}\"><content>{commentText}</content>";
        xml += "</comment></thread></notes>";
        XElement noteXml = XElement.Parse(xml);

        // SUT
        List<List<Comment>> actual = NotesFormatter.ParseNotes(noteXml, associatedPtUser);
        Assert.AreEqual(1, actual.Count);
        Assert.AreEqual(1, actual[0].Count);
        Assert.AreEqual(commentText, actual[0][0].Contents.InnerXml);
        Assert.AreEqual(commentDate, actual[0][0].DateTime);
        Assert.AreEqual(false, actual[0][0].Deleted);
        Assert.AreEqual(thread, actual[0][0].Thread);
        Assert.AreEqual(env.Username01, actual[0][0].User);
        Assert.AreEqual("RUT", actual[0][0].VerseRef.Book);
        Assert.AreEqual(1, actual[0][0].VerseRef.ChapterNum);
        Assert.AreEqual(2, actual[0][0].VerseRef.VerseNum);
    }

    [Test]
    public void ParseNotes_ComplexComment()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        DateTimeOffset commentDate = DateTimeOffset.Now;
        string contents = "<p>Comment Contents</p>";
        string contextAfter = "here.";
        string contextBefore = "Verse";
        string externalUser = "John Doe";
        string selectedText = "one";
        int startPosition = 1;
        string thread = "Answer_dataId0123";
        string verseRefStr = "RUT 1:2";
        string xml = $"<notes version=\"1.1\"><thread id=\"{thread}\">";
        xml += $"<selection verseRef=\"{verseRefStr}\" startPos=\"{startPosition}\"";
        xml += $" selectedText=\"{selectedText}\" beforeContext=\"{contextBefore}\"";
        xml += $" afterContext=\"{contextAfter}\" />";
        xml += $"<comment user=\"{env.Username01}\" date=\"{commentDate:o}\"";
        xml += $" extUser=\"{externalUser}\">";
        xml += $"<content>{contents}</content></comment></thread></notes>";
        XElement noteXml = XElement.Parse(xml);

        // SUT
        List<List<Comment>> actual = NotesFormatter.ParseNotes(noteXml, associatedPtUser);
        Assert.AreEqual(1, actual.Count);
        Assert.AreEqual(1, actual[0].Count);
        Assert.AreEqual(contents, actual[0][0].Contents.InnerXml);
        Assert.AreEqual(false, actual[0][0].Deleted);
        Assert.AreEqual(contextAfter, actual[0][0].ContextAfter);
        Assert.AreEqual(contextBefore, actual[0][0].ContextBefore);
        Assert.AreEqual(externalUser, actual[0][0].ExternalUser);
        Assert.AreEqual(selectedText, actual[0][0].SelectedText);
        Assert.AreEqual(startPosition, actual[0][0].StartPosition);
        Assert.AreEqual(thread, actual[0][0].Thread);
        Assert.AreEqual(env.Username01, actual[0][0].User);
        Assert.AreEqual("RUT", actual[0][0].VerseRef.Book);
        Assert.AreEqual(1, actual[0][0].VerseRef.ChapterNum);
        Assert.AreEqual(2, actual[0][0].VerseRef.VerseNum);
    }

    [Test]
    public void ParseNotes_DeletedComment()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        string thread = "Answer_dataId0123";
        string xml = $"<notes version=\"1.1\"><thread id=\"{thread}\">";
        xml += "<comment deleted=\"true\"></comment></thread></notes>";
        XElement noteXml = XElement.Parse(xml);

        // SUT
        List<List<Comment>> actual = NotesFormatter.ParseNotes(noteXml, associatedPtUser);
        Assert.AreEqual(1, actual.Count);
        Assert.AreEqual(1, actual[0].Count);
        Assert.AreEqual(true, actual[0][0].Deleted);
        Assert.AreEqual(thread, actual[0][0].Thread);
    }

    [Test]
    public void ParseNotes_DetailedCommentContents()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        DateTimeOffset commentDate = DateTimeOffset.Now;
        string thread = "Answer_dataId0123";
        string verseRefStr = "RUT 1:2";
        string xml = $"<notes version=\"1.1\"><thread id=\"{thread}\">";
        xml += $"<selection verseRef=\"{verseRefStr}\" startPos=\"0\" selectedText=\"\" />";
        xml += $"<comment user=\"{env.Username01}\" date=\"{commentDate:o}\"><content>";
        xml += "<p>Comment Text<span style=\"bold\">Bold Text</span>";
        xml += "<span style=\"italic\">Italic Text</span><lang name=\"en_NZ\">Test</lang></p>";
        xml += "</content></comment></thread></notes>";
        XElement noteXml = XElement.Parse(xml);

        // SUT
        List<List<Comment>> actual = NotesFormatter.ParseNotes(noteXml, associatedPtUser);
        Assert.AreEqual(1, actual.Count);
        Assert.AreEqual(1, actual[0].Count);
        string contents = "<p>Comment Text<bold>Bold Text</bold><italic>Italic Text</italic>";
        contents += "<language name=\"en_NZ\">Test</language></p>";
        Assert.AreEqual(contents, actual[0][0].Contents.InnerXml);
        Assert.AreEqual(false, actual[0][0].Deleted);
        Assert.AreEqual(thread, actual[0][0].Thread);
        Assert.AreEqual(env.Username01, actual[0][0].User);
        Assert.AreEqual("RUT", actual[0][0].VerseRef.Book);
        Assert.AreEqual(1, actual[0][0].VerseRef.ChapterNum);
        Assert.AreEqual(2, actual[0][0].VerseRef.VerseNum);
    }

    [Test]
    public void ParseNotes_EmptyComment()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        DateTimeOffset commentDate = DateTimeOffset.Now;
        string thread = "Answer_dataId0123";
        string verseRefStr = "RUT 1:2";
        string xml = $"<notes version=\"1.1\"><thread id=\"{thread}\">";
        xml += $"<selection verseRef=\"{verseRefStr}\" startPos=\"0\" selectedText=\"\" />";
        xml += $"<comment user=\"{env.Username01}\" date=\"{commentDate:o}\"></comment></thread></notes>";
        XElement noteXml = XElement.Parse(xml);

        // SUT
        List<List<Comment>> actual = NotesFormatter.ParseNotes(noteXml, associatedPtUser);
        Assert.AreEqual(1, actual.Count);
        Assert.AreEqual(1, actual[0].Count);
        Assert.AreEqual(string.Empty, actual[0][0].Contents.InnerXml);
        Assert.AreEqual(commentDate, actual[0][0].DateTime);
        Assert.AreEqual(false, actual[0][0].Deleted);
        Assert.AreEqual(thread, actual[0][0].Thread);
        Assert.AreEqual(env.Username01, actual[0][0].User);
        Assert.AreEqual("RUT", actual[0][0].VerseRef.Book);
        Assert.AreEqual(1, actual[0][0].VerseRef.ChapterNum);
        Assert.AreEqual(2, actual[0][0].VerseRef.VerseNum);
    }

    [Test]
    public void ParseNotes_MultipleComments()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        DateTimeOffset firstCommentDate = DateTimeOffset.Now.AddDays(-1);
        DateTimeOffset secondCommentDate = DateTimeOffset.Now;
        string contents = "<p>Comment Contents</p>";
        string thread = "Answer_dataId0123";
        string verseRefStr = "RUT 1:2";
        string xml = $"<notes version=\"1.1\"><thread id=\"{thread}\">";
        xml += $"<selection verseRef=\"{verseRefStr}\" startPos=\"0\" selectedText=\"\" />";
        xml += $"<comment user=\"{env.Username01}\" date=\"{firstCommentDate:o}\"></comment>";
        xml += $"<comment user=\"{env.Username02}\" date=\"{secondCommentDate:o}\">";
        xml += $"<content>{contents}</content></comment>";
        xml += "</thread></notes>";
        XElement noteXml = XElement.Parse(xml);

        // SUT
        List<List<Comment>> actual = NotesFormatter.ParseNotes(noteXml, associatedPtUser);
        Assert.AreEqual(1, actual.Count);
        Assert.AreEqual(2, actual[0].Count);

        // First Comment
        Assert.AreEqual(string.Empty, actual[0][0].Contents.InnerXml);
        Assert.AreEqual(firstCommentDate, actual[0][0].DateTime);
        Assert.AreEqual(false, actual[0][0].Deleted);
        Assert.AreEqual(thread, actual[0][0].Thread);
        Assert.AreEqual(env.Username01, actual[0][0].User);
        Assert.AreEqual("RUT", actual[0][0].VerseRef.Book);
        Assert.AreEqual(1, actual[0][0].VerseRef.ChapterNum);
        Assert.AreEqual(2, actual[0][0].VerseRef.VerseNum);

        // Second Comment
        Assert.AreEqual(contents, actual[0][1].Contents.InnerXml);
        Assert.AreEqual(secondCommentDate, actual[0][1].DateTime);
        Assert.AreEqual(false, actual[0][1].Deleted);
        Assert.AreEqual(thread, actual[0][1].Thread);
        Assert.AreEqual(env.Username02, actual[0][1].User);
        Assert.AreEqual("RUT", actual[0][1].VerseRef.Book);
        Assert.AreEqual(1, actual[0][1].VerseRef.ChapterNum);
        Assert.AreEqual(2, actual[0][1].VerseRef.VerseNum);
    }

    [Test]
    public void ParseNotes_NoComments()
    {
        // Setup the environment
        var env = new TestEnvironment();
        var associatedPtUser = new SFParatextUser(env.Username01);
        env.SetupProject(env.Project01, associatedPtUser);

        // Setup the test data
        string xml = "<notes version=\"1.1\"></notes>";
        XElement noteXml = XElement.Parse(xml);

        // SUT
        List<List<Comment>> actual = NotesFormatter.ParseNotes(noteXml, associatedPtUser);
        Assert.AreEqual(0, actual.Count);
    }

    private class TestEnvironment
    {
        public readonly string Project01 = "project01";
        public readonly string Username01 = "User 01";
        public readonly string Username02 = "User 02";

        private readonly Dictionary<string, HexId> _ptProjectIds;
        private readonly string _syncDir = Path.GetTempPath();
        private readonly string _ruthBookUsfm =
            "\\id RUT - ProjectNameHere\n" + "\\c 1\n" + "\\v 1 Verse one here.\n" + "\\v 2 Verse 2 here.";

        public TestEnvironment() => _ptProjectIds = new Dictionary<string, HexId> { { Project01, HexId.CreateNew() } };

        public MockScrText? ProjectScrText { get; private set; }

        public void SetupProject(string baseId, ParatextUser associatedPtUser, bool hasEditPermission = true)
        {
            string ptProjectId = _ptProjectIds[baseId].Id;
            ProjectScrText = GetScrText(associatedPtUser, ptProjectId, hasEditPermission);
            ProjectFileManager projectFileManager = Substitute.For<ProjectFileManager>(ProjectScrText, null);
            projectFileManager.IsWritable.Returns(true);
            ProjectScrText.SetFileManager(projectFileManager);
        }

        private MockScrText GetScrText(ParatextUser associatedPtUser, string projectId, bool hasEditPermission = true)
        {
            string scrTextDir = Path.Combine(_syncDir, projectId, "target");
            ProjectName projectName = new ProjectName { ProjectPath = scrTextDir, ShortName = "Proj" };
            var scrText = new MockScrText(associatedPtUser, projectName) { CachedGuid = HexId.FromStr(projectId) };
            scrText.Permissions.CreateFirstAdminUser();
            scrText.Data.Add("RUT", _ruthBookUsfm);
            scrText.Settings.BooksPresentSet = new BookSet("RUT");
            if (!hasEditPermission)
                scrText.Permissions.SetPermission(null, 8, PermissionSet.Manual, false);
            return scrText;
        }
    }
}
