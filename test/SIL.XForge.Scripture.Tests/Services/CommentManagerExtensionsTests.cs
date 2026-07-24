using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Xml;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.Languages;
using Paratext.Data.ProjectComments;
using Paratext.Data.ProjectFileAccess;
using Paratext.Data.Repository;
using SIL.WritingSystems;
using SIL.XForge.Scripture.Models;
using ParatextComment = Paratext.Data.ProjectComments.Comment;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class CommentManagerExtensionsTests
{
    private const string ParatextUser01 = "ParatextUser01";

    // A thread whose comments do not all share the same anchor makes Comment.CompareTo
    // inconsistent: comments of the same thread compare to each other by date, but to other
    // threads' comments by anchor. Biblical-term and spelling-note threads have this shape -
    // their location-independent ids (BT_term, project_word) collect comments anchored at
    // different verses. CommentManager.FindThreads sorts all
    // comments and then groups only adjacent comments that share a thread id, so an unlucky sort
    // order returns such a thread split into fragments. This arrangement makes the split
    // deterministic: each comment compares greater than the one before it, so List<T>.Sort's
    // insertion sort (used for small lists) keeps this exact order, leaving thread-a's two
    // comments separated by thread-b's. thread-a's second comment anchors after thread-b's
    // comment but is dated before its own thread-mate, which is where the inconsistency bites.
    private static readonly (string Thread, string VerseRef, DateTimeOffset Date)[] SplitThreadArrangement =
    [
        ("thread-a", "RUT 1:1", new DateTimeOffset(2020, 1, 1, 0, 0, 0, TimeSpan.Zero)),
        ("thread-b", "RUT 1:2", new DateTimeOffset(2020, 1, 2, 0, 0, 0, TimeSpan.Zero)),
        ("thread-a", "RUT 1:3", new DateTimeOffset(2019, 1, 1, 0, 0, 0, TimeSpan.Zero)),
        ("thread-c", "RUT 1:4", new DateTimeOffset(2020, 1, 3, 0, 0, 0, TimeSpan.Zero)),
    ];

    [Test]
    public void FindThreads_SplitsAThreadWhoseCommentsHaveDifferentAnchors()
    {
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(HexId.CreateNew().ToString());
        CommentManager manager = CommentManager.Get(scrText);
        foreach ((string thread, string verseRef, DateTimeOffset date) in SplitThreadArrangement)
            TestEnvironment.AddComment(scrText, thread, verseRef, date);

        // SUT
        List<CommentThread> threads = manager.FindThreads();

        // This asserts the ParatextData bug that FindCompleteThreads exists to work around:
        // thread-a comes back as two single-comment fragments sharing an id. If this test fails
        // after a ParatextData (or .NET sort) update because thread-a comes back whole, the
        // workaround - and this test pair - can likely be removed.
        Assert.That(threads.Count(t => t.Id == "thread-a"), Is.EqualTo(2));
        Assert.That(threads.Where(t => t.Id == "thread-a").Select(t => t.Comments.Count), Is.All.EqualTo(1));
    }

    [Test]
    public void FindCompleteThreads_ReturnsEveryThreadComplete()
    {
        var env = new TestEnvironment();
        using MockScrText scrText = env.GetScrText(HexId.CreateNew().ToString());
        CommentManager manager = CommentManager.Get(scrText);
        foreach ((string thread, string verseRef, DateTimeOffset date) in SplitThreadArrangement)
            TestEnvironment.AddComment(scrText, thread, verseRef, date);

        // SUT
        List<CommentThread> threads = manager.FindCompleteThreads();

        Assert.That(threads.Select(t => t.Id), Is.EquivalentTo(new[] { "thread-a", "thread-b", "thread-c" }));
        CommentThread threadA = threads.Single(t => t.Id == "thread-a");
        // Complete, and in FindThread's order: oldest comment first
        Assert.That(threadA.Comments.Select(c => c.VerseRefStr), Is.EqualTo(["RUT 1:3", "RUT 1:1"]));
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
        }

        public static void AddComment(ScrText scrText, string threadId, string verseRef, DateTimeOffset date)
        {
            XmlDocument doc = new XmlDocument();
            XmlElement root = doc.CreateElement("content");
            XmlElement paragraph = doc.CreateElement("p");
            paragraph.InnerText = "comment text";
            root.AppendChild(paragraph);
            doc.AppendChild(root);

            var comment = new ParatextComment(scrText.User)
            {
                Thread = threadId,
                VerseRefStr = verseRef,
                Contents = root,
                DateTime = date,
                Status = NoteStatus.Todo,
                SelectedText = string.Empty,
                StartPosition = 0,
            };
            CommentManager.Get(scrText).AddComment(comment);
        }

        public MockScrText GetScrText(string paratextId)
        {
            string scrTextDir = Path.Join(_syncDir, paratextId, "target");
            ProjectName projectName = new ProjectName { ProjectPath = scrTextDir, ShortName = "Proj" };
            var scrText = new MockScrText(new SFParatextUser(ParatextUser01), projectName)
            {
                CachedGuid = HexId.FromStr(paratextId),
            };
            scrText.Settings.LanguageID = LanguageId.English;
            scrText.Settings.FileNamePostPart = ".SFM";

            // Set up the file manager for the comment manager
            ProjectFileManager fileManager = Substitute.For<ProjectFileManager>(scrText, null);
            fileManager.IsWritable.Returns(true);
            scrText.SetFileManager(fileManager);

            return scrText;
        }
    }
}
