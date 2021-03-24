using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using Paratext.Data;
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
        public async Task GetNoteThreadChangesFromPT_AddParatextNotes()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(true, true);
            env.AddData(null, null, null, null);
            env.AddParatextNoteThreadData();

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                const string ptNotesText = @"
                    <notes version=""1.1"">
                        <thread id=""thread01"">
                            <selection verseRef=""MAT 1:2"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"" tagAdded=""1"">
                                <content>
                                    <p>Paratext note 1.</p>
                                </content>
                            </comment>
                        </thread>
                        <thread id=""thread01"">
                            <selection verseRef=""MAT 1:2"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user03"" date=""2019-01-01T08:00:00.0000000+00:00"">
                                <content>
                                    <p>Paratext note 2.</p>
                                </content>
                            </comment>
                        </thread>
                        <thread id=""thread02"">
                            <selection verseRef=""MAT 1:3"" startPos=""0"" selectedText=""note 3 text"" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"" tagAdded=""2"">
                                <content>
                                    <p>Paratext note 3.</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";

                IEnumerable<ParatextNoteThreadChange> changes = env.Mapper.GetNoteThreadChangesFromPT(
                    XElement.Parse(ptNotesText), await env.GetNoteThreadDocsAsync(conn));
                Assert.That(changes.Count, Is.EqualTo(2));
                ParatextNoteThreadChange thread01 = changes.First();
                Assert.That(thread01.VerseRefStr, Is.EqualTo("MAT 1:2"));
                Assert.That(thread01.NotesAdded.Count, Is.EqualTo(1));
                string expected1 = "thread01:syncuser01:2019-01-01T08:00:00.0000000+00:00-" +
                    "user03-" + "Paratext note 2.-" + "False-" + "icon1";
                Assert.That(env.ParatextNoteToString(thread01.NotesAdded[0]), Is.EqualTo(expected1));
                Assert.That(thread01.NotesUpdated.Count, Is.EqualTo(0));
                ParatextNoteThreadChange thread02 = changes.Last();
                Assert.That(thread02.VerseRefStr, Is.EqualTo("MAT 1:3"));
                Assert.That(thread02.SelectedText, Is.EqualTo("note 3 text"));
                Assert.That(thread02.NotesAdded.Count, Is.EqualTo(1));
                string expected2 = "thread02:syncuser01:2019-01-01T08:00:00.0000000+00:00-" +
                    "user02-" + "Paratext note 3.-" + "False-" + "icon2";
                Assert.That(env.ParatextNoteToString(thread02.NotesAdded[0]), Is.EqualTo(expected2));
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
        public async Task GetNoteThreadChangesFromPT_UpdateParatextNotes()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(true, true);
            env.AddData(null, null, null, null);
            env.AddParatextNoteThreadData();

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                const string ptNotesText = @"
                    <notes version=""1.1"">
                        <thread id=""thread01"">
                            <selection verseRef=""MAT 1:2"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"" tagAdded=""1"">
                                <content>
                                    <p>Paratext note 1 updated in Paratext.</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";

                IEnumerable<ParatextNoteThreadChange> changes = env.Mapper.GetNoteThreadChangesFromPT(
                    XElement.Parse(ptNotesText), await env.GetNoteThreadDocsAsync(conn));

                // Does not add the thread from a community checking question
                Assert.That(changes.Count, Is.EqualTo(1));
                ParatextNoteThreadChange thread01 = changes.First();
                Assert.That(thread01.NotesAdded.Count, Is.EqualTo(0));
                Assert.That(thread01.NotesUpdated.Count, Is.EqualTo(1));
                string expected = "thread01:syncuser01:2019-01-01T08:00:00.0000000+00:00-" +
                    "user02-" + "Paratext note 1 updated in Paratext.-" + "False-" + "icon1";
                Assert.That(env.ParatextNoteToString(thread01.NotesUpdated[0]), Is.EqualTo(expected));
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
        public async Task GetNoteThreadChangesFromPT_DeleteParatextNotes()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(true, true);
            env.AddData(null, null, null, null);
            env.AddParatextNoteThreadData();

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                const string ptNotesText = @"
                    <notes version=""1.1"">
                        <thread id=""thread01"">
                            <selection verseRef=""MAT 1:2"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"" deleted=""true"" tagAdded=""1"">
                                <content>
                                    <p>Paratext note 1.</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";

                IEnumerable<ParatextNoteThreadChange> changes = env.Mapper.GetNoteThreadChangesFromPT(
                    XElement.Parse(ptNotesText), await env.GetNoteThreadDocsAsync(conn));

                Assert.That(changes.Count, Is.EqualTo(1));
                ParatextNoteThreadChange thread01 = changes.First();
                Assert.That(thread01.NotesUpdated.Count, Is.EqualTo(0));
                Assert.That(thread01.NotesDeleted.Count, Is.EqualTo(1));
                string expected = "thread01:syncuser01:2019-01-01T08:00:00.0000000+00:00-" +
                    "user02-" + "Paratext note 1.-" + "True-" + "icon1";
                Assert.That(env.ParatextNoteToString(thread01.NotesDeleted[0]), Is.EqualTo(expected));
            }
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
                    ParatextUsersOnProject(twoPtUsersOnProject), "paratextId", Tags);
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

            public void AddParatextNoteThreadData()
            {
                RealtimeService.AddRepository("note_threads", OTType.Json0,
                    new MemoryRepository<ParatextNoteThread>(new[]
                    {
                        new ParatextNoteThread
                        {
                            Id = "project01:thread01",
                            DataId = "thread01",
                            ProjectRef = "project01",
                            OwnerRef = "user01",
                            VerseRef = new VerseRefData(40, 1, 1),
                            SelectedText = "Scripture text in project.",
                            Notes = new List<ParatextNote>
                            {
                                new ParatextNote
                                {
                                    DataId = "thread01:syncuser01:2019-01-01T08:00:00.0000000+00:00",
                                    ThreadId = "thread01",
                                    OwnerRef = "user02",
                                    SyncUserRef = "syncuser01",
                                    ExtUserId = "user02",
                                    Content = "Paratext note 1.",
                                    DateCreated = new DateTime(2019, 1, 1, 8, 0, 0, DateTimeKind.Utc),
                                    TagIcon = "icon1"
                                }
                            }
                        }
                    })
                );
            }

            public async Task<IEnumerable<IDocument<Question>>> GetQuestionDocsAsync(IConnection conn)
            {
                IDocument<Question> questionDoc = await conn.FetchAsync<Question>("project01:question01");
                return new[] { questionDoc };
            }

            public async Task<IEnumerable<IDocument<ParatextNoteThread>>> GetNoteThreadDocsAsync(IConnection conn)
            {
                IDocument<ParatextNoteThread> noteThreadDoc =
                    await conn.FetchAsync<ParatextNoteThread>("project01:thread01");
                return new[] { noteThreadDoc };
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
                var scrtextDir = Path.Combine(Path.GetTempPath(), "project01", "target");
                var associatedPtUser = new SFParatextUser("user01");
                ProjectName projectName = new ProjectName() { ProjectPath = scrtextDir, ShortName = "Proj" };
                MockScrText scrText = new MockScrText(associatedPtUser, projectName);
                var tags = new MockCommentTags(scrText);
                tags.InitializeTagList(tagIds);
                Tags = tags;
            }

            public string ParatextNoteToString(ParatextNote note)
            {
                string result = $"{note.DataId}-{note.ExtUserId}-{note.Content}-{note.Deleted}";
                if (note.TagIcon != null)
                    result = result + $"-{note.TagIcon}";
                return result;
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
