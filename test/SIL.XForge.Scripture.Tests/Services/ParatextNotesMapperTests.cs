using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class ParatextNotesMapperTests
    {
        [Test]
        public async Task GetNotesChangelistAsync_AddNotes()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(false, true);
            env.AddData(null, null, null, null);

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                const string oldNotesText = @"
                    <notes version=""1.1"">
                        <thread id=""ANSWER_answer03"">
                            <selection verseRef=""MAT 1:2"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-03T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 3.</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";
                XElement notesElem = await env.Mapper.GetNotesChangelistAsync(XElement.Parse(oldNotesText),
                    await env.GetQuestionDocsAsync(conn));

                const string expectedNotesText = @"
                    <notes version=""1.1"">
                        <thread id=""ANSWER_answer01"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 1.</p>
                                </content>
                            </comment>
                            <comment user=""PT User 3"" date=""2019-01-01T09:00:00.0000000+00:00"">
                                <content>Test comment 1.</content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer02"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p><span style=""italic"">This is some scripture. (MAT 1:2-3)</span></p>
                                    <p>Test answer 2.</p>
                                </content>
                            </comment>
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-02T09:00:00.0000000+00:00"">
                                <content>Test comment 2.</content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer03"">
                            <selection verseRef=""MAT 1:2"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-03T08:00:00.0000000+00:00"" deleted=""true"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 3.</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";
                Assert.That(XNode.DeepEquals(notesElem, XElement.Parse(expectedNotesText)), Is.True);

                Assert.That(env.Mapper.NewSyncUsers.Select(su => su.ParatextUsername),
                    Is.EquivalentTo(new[] { "PT User 1", "PT User 3" }));
            }
        }

        [Test]
        public async Task PTCommentThreadChanges_AddParatextNote()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(true, true);
            env.AddData(null, null, null, null);
            var comp1 = new ThreadComponents { threadNum = 1, noteCount = 1 };
            env.AddParatextNoteThreadData(new[] { comp1 });

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                IEnumerable<Paratext.Data.ProjectComments.CommentThread> commentThreads = new[]
                {
                    env.GetCommentThread(new ThreadComponents { threadNum = 1, noteCount = 2 }),
                    env.GetCommentThread(new ThreadComponents { threadNum = 2, noteCount = 1 })
                };
                IEnumerable<ParatextNoteThreadChange> changes = env.Mapper.PTCommentThreadChanges(
                    await env.GetNoteThreadDocsAsync(conn, new[] { "thread01" }), commentThreads, env.Tags);
                Assert.That(changes.Count, Is.EqualTo(2));
                ParatextNoteThreadChange thread01 = changes.First();
                Assert.That(thread01.VerseRefStr, Is.EqualTo("MAT 1:2"));
                Assert.That(thread01.NotesAdded.Count, Is.EqualTo(1));
                string expected1 = "thread01:syncuser01:2019-01-02T08:00:00.0000000+00:00-" +
                    "user03-" + "<p>thread01 note 2.</p>-" + "0-" + "icon2";
                Assert.That(env.ParatextNoteToString(thread01.NotesAdded[0]), Is.EqualTo(expected1));
                Assert.That(thread01.NotesUpdated.Count, Is.EqualTo(0));
                ParatextNoteThreadChange thread02 = changes.Last();
                Assert.That(thread02.VerseRefStr, Is.EqualTo("MAT 1:3"));
                Assert.That(thread02.SelectedText, Is.EqualTo("Text selected thread02"));
                Assert.That(thread02.NotesAdded.Count, Is.EqualTo(1));
                string expected2 = "thread02:syncuser01:2019-01-01T08:00:00.0000000+00:00-" +
                    "user02-" + "<p>thread02 note 1.</p>-" + "10-" + "icon1";
                Assert.That(env.ParatextNoteToString(thread02.NotesAdded[0]), Is.EqualTo(expected2));
            }
        }

        [Test]
        public async Task SFNotesToCommentChangeList_AddParatextComment()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(true, true);
            var comp1 = new ThreadComponents { threadNum = 1, noteCount = 1 };
            var comp2 = new ThreadComponents { threadNum = 2, noteCount = 2 };
            env.AddParatextNoteThreadData(new[] { comp1, comp2 });

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                IEnumerable<Paratext.Data.ProjectComments.CommentThread> commentThreads = new[]
                {
                    env.GetCommentThread(new ThreadComponents { threadNum = 2, noteCount = 1 })
                };
                var changes = env.Mapper.SFNotesToCommentChangeList(
                    await env.GetNoteThreadDocsAsync(conn, new[] { "thread01", "thread02" }), commentThreads, env.Tags);

                Assert.That(changes.Count, Is.EqualTo(2));
                List<Paratext.Data.ProjectComments.Comment> thread01 = changes.First();
                Assert.That(thread01.Count, Is.EqualTo(1));
                var comment = thread01.First();
                Assert.That(comment.VerseRefStr, Is.EqualTo("MAT 1:2"));
                string expected1 = "thread01/PT User 1/2019-01-01T08:00:00.0000000+00:00-" +
                    "user02-" + "<p>thread01 note 1.</p>-" + "0-" + "Tag:1";
                Assert.That(env.ParatextCommentToString(comment), Is.EqualTo(expected1));
                var thread02 = changes.Last();
                Assert.That(thread02.Count, Is.EqualTo(1));
                comment = thread02.First();
                Assert.That(comment.VerseRefStr, Is.EqualTo("MAT 1:3"));
                Assert.That(comment.SelectedText, Is.EqualTo("Text selected thread02"));
                string expected2 = "thread02/PT User 1/2019-01-02T08:00:00.0000000+00:00-" +
                    "user02-" + "<p>thread02 note 2.</p>-" + "10-" + "Tag:2";
                Assert.That(env.ParatextCommentToString(comment), Is.EqualTo(expected2));
            }
        }

        [Test]
        public async Task GetNotesChangelistAsync_AddAudioNotes()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(false, true);
            env.AddData(null, null, null, null, true);

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                const string oldNotesText = @"
                    <notes version=""1.1"">
                        <thread id=""ANSWER_answer03"">
                            <selection verseRef=""MAT 1:2"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-03T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">- xForge audio-only question -</span></p>
                                    <p>Test answer 3.</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";
                XElement notesElem = await env.Mapper.GetNotesChangelistAsync(XElement.Parse(oldNotesText),
                    await env.GetQuestionDocsAsync(conn));

                const string expectedNotesText = @"
                    <notes version=""1.1"">
                        <thread id=""ANSWER_answer01"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">- xForge audio-only question -</span></p>
                                    <p>- xForge audio-only response -</p>
                                </content>
                            </comment>
                            <comment user=""PT User 3"" date=""2019-01-01T09:00:00.0000000+00:00"">
                                <content>Test comment 1.</content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer02"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">- xForge audio-only question -</span></p>
                                    <p><span style=""italic"">This is some scripture. (MAT 1:2-3)</span></p>
                                    <p>Test answer 2.</p>
                                </content>
                            </comment>
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-02T09:00:00.0000000+00:00"">
                                <content>Test comment 2.</content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer03"">
                            <selection verseRef=""MAT 1:2"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-03T08:00:00.0000000+00:00"" deleted=""true"">
                                <content>
                                    <p><span style=""bold"">- xForge audio-only question -</span></p>
                                    <p>Test answer 3.</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";
                Assert.That(XNode.DeepEquals(notesElem, XElement.Parse(expectedNotesText)), Is.True);

                Assert.That(env.Mapper.NewSyncUsers.Select(su => su.ParatextUsername),
                    Is.EquivalentTo(new[] { "PT User 1", "PT User 3" }));
            }
        }

        [Test]
        public async Task GetNotesChangelistAsync_ParatextUserNotOnProject_AddNotes()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(false);
            await env.InitMapperAsync(false, true);
            env.AddData(null, null, null, null);

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                const string oldNotesText = @"
                    <notes version=""1.1"">
                        <thread id=""ANSWER_answer03"">
                            <selection verseRef=""MAT 1:2"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-03T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 3.</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";
                XElement notesElem = await env.Mapper.GetNotesChangelistAsync(XElement.Parse(oldNotesText),
                    await env.GetQuestionDocsAsync(conn));

                // User 3 is a PT user but does not have a role on this particular PT project, according to the PT
                // Registry. So we will attribute their comment to user 1, who does have a role on this project
                // according to the PT registry. Otherwise we would get errors when uploading a note attributed to user
                // 3's PT username since they do not have appropriate access to write a note. Also, NewSyncUsers will
                // not contain user 3.
                const string expectedNotesText = @"
                    <notes version=""1.1"">
                        <thread id=""ANSWER_answer01"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 1.</p>
                                </content>
                            </comment>
                            <comment user=""PT User 1"" extUser=""user03"" date=""2019-01-01T09:00:00.0000000+00:00"">
                                <content>Test comment 1.</content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer02"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p><span style=""italic"">This is some scripture. (MAT 1:2-3)</span></p>
                                    <p>Test answer 2.</p>
                                </content>
                            </comment>
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-02T09:00:00.0000000+00:00"">
                                <content>Test comment 2.</content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer03"">
                            <selection verseRef=""MAT 1:2"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-03T08:00:00.0000000+00:00"" deleted=""true"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 3.</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";
                Assert.That(XNode.DeepEquals(notesElem, XElement.Parse(expectedNotesText)), Is.True);

                Assert.That(env.Mapper.NewSyncUsers.Select(su => su.ParatextUsername),
                    Is.EquivalentTo(new[] { "PT User 1" }));
            }
        }

        [Test]
        public async Task GetNotesChangelistAsync_UpdateNotes()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(true, true);
            env.AddData("syncuser01", "syncuser03", null, "syncuser03");

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                const string oldNotesText = @"
                    <notes version=""1.1"">
                        <thread id=""ANSWER_answer01"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Old test answer 1.</p>
                                </content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer02"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 3"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p><span style=""italic"">This is some scripture. (MAT 1:2-3)</span></p>
                                    <p>Test answer 2.</p>
                                </content>
                            </comment>
                            <comment user=""PT User 3"" extUser=""user02"" date=""2019-01-02T09:00:00.0000000+00:00"">
                                <content>Old test comment 2.</content>
                            </comment>
                        </thread>
                    </notes>";
                XElement notesElem = await env.Mapper.GetNotesChangelistAsync(XElement.Parse(oldNotesText),
                    await env.GetQuestionDocsAsync(conn));

                const string expectedNotesText = @"
                    <notes version=""1.1"">
                        <thread id=""ANSWER_answer01"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 1.</p>
                                </content>
                            </comment>
                            <comment user=""PT User 3"" date=""2019-01-01T09:00:00.0000000+00:00"">
                                <content>Test comment 1.</content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer02"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 3"" extUser=""user02"" date=""2019-01-02T09:00:00.0000000+00:00"">
                                <content>Test comment 2.</content>
                            </comment>
                        </thread>
                    </notes>";
                Assert.That(XNode.DeepEquals(notesElem, XElement.Parse(expectedNotesText)), Is.True);

                Assert.That(env.Mapper.NewSyncUsers, Is.Empty);
            }
        }

        [Test]
        public async Task PTCommentThreadChanges_UpdateParatextNotes()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(true, true);
            env.AddData(null, null, null, null);
            var comp1 = new ThreadComponents { threadNum = 1, noteCount = 1 };
            env.AddParatextNoteThreadData(new[] { comp1 });

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                IEnumerable<Paratext.Data.ProjectComments.CommentThread> commentThreads = new[]
                {
                    env.GetCommentThread(new ThreadComponents { threadNum = 1, noteCount = 1, isEdited = true }),
                };
                IEnumerable<ParatextNoteThreadChange> changes = env.Mapper.PTCommentThreadChanges(
                    await env.GetNoteThreadDocsAsync(conn, new[] { "thread01" }), commentThreads, env.Tags);

                Assert.That(changes.Count, Is.EqualTo(1));
                ParatextNoteThreadChange thread01 = changes.First();
                Assert.That(thread01.NotesAdded.Count, Is.EqualTo(0));
                Assert.That(thread01.NotesUpdated.Count, Is.EqualTo(1));
                string expected = "thread01:syncuser01:2019-01-01T08:00:00.0000000+00:00-" +
                    "user02-" + "<p>thread01 note 1: EDITED.</p>-" + "0-" + "icon1";
                Assert.That(env.ParatextNoteToString(thread01.NotesUpdated[0]), Is.EqualTo(expected));
            }
        }

        [Test]
        public async Task SFNotesToCommentChangeList_UpdateParatextComments()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(true, true);
            var comp1 = new ThreadComponents { threadNum = 1, noteCount = 1, isEdited = true };
            env.AddParatextNoteThreadData(new[] { comp1 });

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                IEnumerable<Paratext.Data.ProjectComments.CommentThread> commentThreads = new[]
                {
                    env.GetCommentThread(new ThreadComponents { threadNum = 1, noteCount = 1 }),
                };
                var changes = env.Mapper.SFNotesToCommentChangeList(
                    await env.GetNoteThreadDocsAsync(conn, new[] { "thread01" }), commentThreads, env.Tags);

                Assert.That(changes.Count, Is.EqualTo(1));
                var thread01 = changes.First();
                Assert.That(thread01.Count, Is.EqualTo(1));
                Paratext.Data.ProjectComments.Comment comment = thread01.First();
                string expected = "thread01/PT User 1/2019-01-01T08:00:00.0000000+00:00-" +
                    "user02-" + "<p>thread01 note 1: EDITED.</p>-" + "0-" + "Tag:1";
                Assert.That(env.ParatextCommentToString(comment), Is.EqualTo(expected));
            }
        }

        [Test]
        public async Task GetNotesChangelistAsync_DeleteNotes()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(true, true);
            env.AddData("syncuser01", "syncuser03", "syncuser03", "syncuser03");

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                const string oldNotesText = @"
                    <notes version=""1.1"">
                        <thread id=""ANSWER_answer01"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 1.</p>
                                </content>
                            </comment>
                            <comment user=""PT User 3"" date=""2019-01-01T09:00:00.0000000+00:00"">
                                <content>Old test comment 1.</content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer02"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 3"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p><span style=""italic"">This is some scripture. (MAT 1:2-3)</span></p>
                                    <p>Test answer 2.</p>
                                </content>
                            </comment>
                            <comment user=""PT User 3"" extUser=""user02"" date=""2019-01-02T09:00:00.0000000+00:00"">
                                <content>Test comment 2.</content>
                            </comment>
                            <comment user=""PT User 1"" date=""2019-01-02T10:00:00.0000000+00:00"">
                                <content>Test comment 3.</content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer03"">
                            <selection verseRef=""MAT 1:2"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-03T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 3.</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";
                XElement notesElem = await env.Mapper.GetNotesChangelistAsync(XElement.Parse(oldNotesText),
                    await env.GetQuestionDocsAsync(conn));

                const string expectedNotesText = @"
                    <notes version=""1.1"">
                        <thread id=""ANSWER_answer01"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 3"" date=""2019-01-01T09:00:00.0000000+00:00"">
                                <content>Test comment 1.</content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer02"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" date=""2019-01-02T10:00:00.0000000+00:00"" deleted=""true"">
                                <content>Test comment 3.</content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer03"">
                            <selection verseRef=""MAT 1:2"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-03T08:00:00.0000000+00:00"" deleted=""true"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 3.</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";
                Assert.That(XNode.DeepEquals(notesElem, XElement.Parse(expectedNotesText)), Is.True);

                Assert.That(env.Mapper.NewSyncUsers, Is.Empty);
            }
        }

        [Test]
        public async Task PTCommentThreadChanges_DeleteParatextNotes()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(true, true);
            env.AddData(null, null, null, null);
            var comp1 = new ThreadComponents { threadNum = 1, noteCount = 1 };
            env.AddParatextNoteThreadData(new[] { comp1 });

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                IEnumerable<Paratext.Data.ProjectComments.CommentThread> commentThreads = new[]
                {
                    env.GetCommentThread(new ThreadComponents { threadNum = 1, noteCount = 1, isDeleted = true }),
                };
                IEnumerable<ParatextNoteThreadChange> changes = env.Mapper.PTCommentThreadChanges(
                    await env.GetNoteThreadDocsAsync(conn, new[] { "thread01" }), commentThreads, env.Tags);

                Assert.That(changes.Count, Is.EqualTo(1));
                ParatextNoteThreadChange thread01 = changes.First();
                Assert.That(thread01.NotesUpdated.Count, Is.EqualTo(0));
                Assert.That(thread01.NotesDeleted.Count, Is.EqualTo(1));
                string expected = "thread01:syncuser01:2019-01-01T08:00:00.0000000+00:00-" +
                    "user02-" + "<p>thread01 note 1.</p>-" + "0-" + "deleted-" + "icon1";
                Assert.That(env.ParatextNoteToString(thread01.NotesDeleted[0]), Is.EqualTo(expected));
            }
        }

        [Test]
        public async Task SFNotesToCommentChangeList_DeleteParatextComments()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(true, true);
            var comp1 = new ThreadComponents { threadNum = 1, noteCount = 1, isDeleted = true };
            env.AddParatextNoteThreadData(new[] { comp1 });

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                IEnumerable<Paratext.Data.ProjectComments.CommentThread> commentThreads = new[]
                {
                    env.GetCommentThread(new ThreadComponents { threadNum = 1, noteCount = 1 }),
                };
                var changes = env.Mapper.SFNotesToCommentChangeList(
                    await env.GetNoteThreadDocsAsync(conn, new[] { "thread01" }), commentThreads, env.Tags);

                Assert.That(changes.Count, Is.EqualTo(1));
                var thread01 = changes.First();
                Paratext.Data.ProjectComments.Comment comment = thread01.First();
                string expected = "thread01/PT User 1/2019-01-01T08:00:00.0000000+00:00-" +
                    "user02-" + "<p>thread01 note 1.</p>-" + "0-" + "deleted-" + "Tag:1";
                Assert.That(env.ParatextCommentToString(comment), Is.EqualTo(expected));
            }
        }

        private struct ThreadComponents
        {
            public int threadNum;
            public int noteCount;
            public bool isEdited;
            public bool isDeleted;
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                UserSecrets = new MemoryRepository<UserSecret>(new[]
                {
                    new UserSecret { Id = "user01" },
                    new UserSecret { Id = "user03" }
                });

                RealtimeService = new SFMemoryRealtimeService();

                ParatextService = Substitute.For<IParatextService>();
                ParatextService.GetParatextUsername(Arg.Is<UserSecret>(u => u.Id == "user01")).Returns("PT User 1");
                ParatextService.GetParatextUsername(Arg.Is<UserSecret>(u => u.Id == "user03")).Returns("PT User 3");
                var options = Microsoft.Extensions.Options.Options.Create(new LocalizationOptions
                {
                    ResourcesPath = "Resources"
                });
                var factory = new ResourceManagerStringLocalizerFactory(options, NullLoggerFactory.Instance);
                Localizer = new StringLocalizer<SharedResource>(factory);
                var siteOptions = Substitute.For<IOptions<SiteOptions>>();
                siteOptions.Value.Returns(new SiteOptions
                {
                    Name = "xForge",
                });
                Mapper = new ParatextNotesMapper(UserSecrets, ParatextService, Localizer, siteOptions);
            }

            public ParatextNotesMapper Mapper { get; }
            public MemoryRepository<UserSecret> UserSecrets { get; }
            public SFMemoryRealtimeService RealtimeService { get; }
            public IParatextService ParatextService { get; }
            public IStringLocalizer<SharedResource> Localizer { get; }
            public Paratext.Data.ProjectComments.CommentTags Tags { get; set; }

            public async Task InitMapperAsync(bool includeSyncUsers, bool twoPtUsersOnProject)
            {
                SetCommentTags(new int[] { 1, 2, 3 });
                await Mapper.InitAsync(UserSecrets.Get("user01"), ProjectSecret(includeSyncUsers),
                    ParatextUsersOnProject(twoPtUsersOnProject), "paratextId");
            }

            public void AddData(string answerSyncUserId1, string answerSyncUserId2, string commentSyncUserId1,
                string commentSyncUserId2, bool useAudioResponses = false)
            {
                RealtimeService.AddRepository("questions", OTType.Json0, new MemoryRepository<Question>(new[]
                {
                    new Question
                    {
                        Id = "project01:question01",
                        DataId = "question01",
                        VerseRef = new VerseRefData(40, 1, 1),
                        Text = useAudioResponses ? "" : "Test question?",
                        Answers =
                        {
                            new Answer
                            {
                                DataId = "answer01",
                                OwnerRef = "user02",
                                SyncUserRef = answerSyncUserId1,
                                DateCreated = new DateTime(2019, 1, 1, 8, 0, 0, DateTimeKind.Utc),
                                Text = useAudioResponses ? "" : "Test answer 1.",
                                Comments =
                                {
                                    new Comment
                                    {
                                        DataId = "comment01",
                                        OwnerRef = "user03",
                                        SyncUserRef = commentSyncUserId1,
                                        DateCreated = new DateTime(2019, 1, 1, 9, 0, 0, DateTimeKind.Utc),
                                        Text = "Test comment 1."
                                    }
                                }
                            },
                            new Answer
                            {
                                DataId = "answer02",
                                OwnerRef = "user04",
                                SyncUserRef = answerSyncUserId2,
                                DateCreated = new DateTime(2019, 1, 2, 8, 0, 0, DateTimeKind.Utc),
                                Text = "Test answer 2.",
                                VerseRef = new VerseRefData(40, 1, "2-3"),
                                ScriptureText = "This is some scripture.",
                                Comments =
                                {
                                    new Comment
                                    {
                                        DataId = "comment02",
                                        OwnerRef = "user02",
                                        SyncUserRef = commentSyncUserId2,
                                        DateCreated = new DateTime(2019, 1, 2, 9, 0, 0, DateTimeKind.Utc),
                                        Text = "Test comment 2."
                                    }
                                }
                            }
                        }
                    }
                }));
            }

            public void AddParatextNoteThreadData(ThreadComponents[] threadComponents)
            {
                IEnumerable<ParatextNoteThread> threads = new ParatextNoteThread[0];
                foreach (var comp in threadComponents)
                {
                    string threadId = "thread0" + comp.threadNum;
                    var noteThread = new ParatextNoteThread
                    {
                        Id = "project01:" + threadId,
                        DataId = threadId,
                        ProjectRef = "project01",
                        OwnerRef = "user01",
                        VerseRef = new VerseRefData(40, 1, comp.threadNum + 1),
                        SelectedText = "Text selected " + threadId
                    };
                    List<ParatextNote> notes = new List<ParatextNote>();
                    for (int i = 1; i <= comp.noteCount; i++)
                    {
                        notes.Add(new ParatextNote
                        {
                            DataId = $"{threadId}:syncuser01:2019-01-0{i}T08:00:00.0000000+00:00",
                            ThreadId = threadId,
                            OwnerRef = "user02",
                            SyncUserRef = "syncuser01",
                            ExtUserId = "user02",
                            Content = comp.isEdited ? $"<p>{threadId} note {i}: EDITED.</p>" : $"<p>{threadId} note {i}.</p>",
                            DateCreated = new DateTime(2019, 1, i, 8, 0, 0, DateTimeKind.Utc),
                            TagIcon = $"icon{i}",
                            StartPosition = 10 * (comp.threadNum - 1),
                            Deleted = comp.isDeleted
                        });
                    }
                    noteThread.Notes = notes;
                    threads = threads.Append(noteThread);
                }
                RealtimeService.AddRepository("note_threads", OTType.Json0,
                    new MemoryRepository<ParatextNoteThread>(threads));
            }

            public async Task<IEnumerable<IDocument<Question>>> GetQuestionDocsAsync(IConnection conn)
            {
                IDocument<Question> questionDoc = await conn.FetchAsync<Question>("project01:question01");
                return new[] { questionDoc };
            }

            public async Task<IEnumerable<IDocument<ParatextNoteThread>>> GetNoteThreadDocsAsync(IConnection conn,
                string[] threadIds)
            {
                IDocument<ParatextNoteThread>[] noteThreadDocs = new IDocument<ParatextNoteThread>[threadIds.Length];
                var tasks = new List<Task>();
                for (int i = 0; i < threadIds.Length; i++)
                {
                    async Task fetchNoteThread(int index)
                    {
                        noteThreadDocs[index] = await conn.FetchAsync<ParatextNoteThread>("project01:" + threadIds[index]);
                    }
                    tasks.Add(fetchNoteThread(i));
                }
                await Task.WhenAll(tasks);
                return noteThreadDocs;
            }

            public void SetParatextProjectRoles(bool twoPtUserOnProject)
            {
                Dictionary<string, string> ptUserRoles = new Dictionary<string, string>();
                ptUserRoles["ptuser01"] = "pt_administrator";
                if (twoPtUserOnProject)
                    ptUserRoles["ptuser03"] = "pt_translator";
                ParatextService.GetProjectRolesAsync(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(ptUserRoles);
            }

            public void SetCommentTags(int[] tagIds)
            {
                var commentTags = MockCommentTags.GetCommentTags("user01", "paratextId");
                commentTags.InitializeTagList(tagIds);
                Tags = commentTags;
            }

            public string ParatextNoteToString(ParatextNote note)
            {
                string result = $"{note.DataId}-{note.ExtUserId}-{note.Content}-{note.StartPosition}";
                if (note.Deleted)
                    result = result + "-deleted";
                if (note.TagIcon != null)
                    result = result + $"-{note.TagIcon}";
                return result;
            }

            public string ParatextCommentToString(Paratext.Data.ProjectComments.Comment comment)
            {
                string result = $"{comment.Id}-{comment.ExternalUser}-{comment.Contents.InnerXml}-{comment.StartPosition}";
                if (comment.Deleted)
                    result = result + "-deleted";
                if (comment.TagsAdded != null)
                    result = result + $"-Tag:{comment.TagsAdded[0]}";
                return result;
            }

            public Paratext.Data.ProjectComments.CommentThread GetCommentThread(ThreadComponents comp)
            {
                string threadId = $"thread0{comp.threadNum}";
                var thread = new Paratext.Data.ProjectComments.CommentThread();
                XmlDocument doc = new XmlDocument();
                var ptUser = new SFParatextUser("PT User 1");
                for (int i = 1; i <= comp.noteCount; i++)
                {
                    var content = doc.CreateElement("Contents");
                    content.InnerXml = comp.isEdited ? $"<p>{threadId} note {i}: EDITED.</p>" : $"<p>{threadId} note {i}.</p>";
                    var comment = new Paratext.Data.ProjectComments.Comment(ptUser)
                    {
                        Contents = content,
                        TagsAdded = new[] { $"{i}" },
                        ExternalUser = $"user0{i + 1}",
                        Date = $"2019-01-0{i}T08:00:00.0000000+00:00",
                        StartPosition = 10 * (comp.threadNum - 1),
                        SelectedText = $"Text selected {threadId}",
                        VerseRefStr = $"MAT 1:{comp.threadNum + 1}",
                        Deleted = comp.isDeleted
                    };

                    comment.Thread = threadId;
                    thread.Comments.Add(comment);
                }
                return thread;
            }

            private static SFProjectSecret ProjectSecret(bool includeSyncUsers)
            {
                var syncUsers = new List<SyncUser>();
                if (includeSyncUsers)
                {
                    syncUsers.Add(new SyncUser { Id = "syncuser01", ParatextUsername = "PT User 1" });
                    syncUsers.Add(new SyncUser { Id = "syncuser03", ParatextUsername = "PT User 3" });
                }

                return new SFProjectSecret
                {
                    Id = "project01",
                    SyncUsers = syncUsers.ToList()
                };
            }

            private static List<User> ParatextUsersOnProject(bool twoPtUsersOnProject)
            {
                var ptUsers = new List<User>
                {
                    new User { Id = "user01", ParatextId = "ptuser01" }
                };
                if (twoPtUsersOnProject)
                    ptUsers.Add(new User { Id = "user03", ParatextId = "ptuser03" });
                return ptUsers;
            }
        }
    }
}
