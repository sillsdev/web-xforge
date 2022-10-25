using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
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
                const string oldNotesText =
                    @"
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
                Dictionary<string, ParatextUserProfile> ptProjectUsers = env.PtProjectUsers.ToDictionary(
                    u => u.Username
                );
                XElement notesElem = await env.Mapper.GetNotesChangelistAsync(
                    XElement.Parse(oldNotesText),
                    await env.GetQuestionDocsAsync(conn),
                    ptProjectUsers,
                    CheckingAnswerExport.All
                );

                const string expectedNotesText =
                    @"
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
                        <thread id=""ANSWER_answer04"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 4 is marked for export</p>
                                </content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer05"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 5 is resolved</p>
                                </content>
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

                Assert.That(ptProjectUsers.Keys, Is.EquivalentTo(new[] { "PT User 1", "PT User 3" }));
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
                const string oldNotesText =
                    @"
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
                Dictionary<string, ParatextUserProfile> ptProjectUsers = env.PtProjectUsers.ToDictionary(
                    u => u.Username
                );
                XElement notesElem = await env.Mapper.GetNotesChangelistAsync(
                    XElement.Parse(oldNotesText),
                    await env.GetQuestionDocsAsync(conn),
                    ptProjectUsers,
                    CheckingAnswerExport.All
                );

                const string expectedNotesText =
                    @"
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
                        <thread id=""ANSWER_answer04"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">- xForge audio-only question -</span></p>
                                    <p>Test answer 4 is marked for export</p>
                                </content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer05"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">- xForge audio-only question -</span></p>
                                    <p>Test answer 5 is resolved</p>
                                </content>
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

                Assert.That(ptProjectUsers.Keys, Is.EquivalentTo(new[] { "PT User 1", "PT User 3" }));
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
                const string oldNotesText =
                    @"
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
                Dictionary<string, ParatextUserProfile> ptProjectUsers = env.PtProjectUsers.ToDictionary(
                    u => u.Username
                );
                XElement notesElem = await env.Mapper.GetNotesChangelistAsync(
                    XElement.Parse(oldNotesText),
                    await env.GetQuestionDocsAsync(conn),
                    ptProjectUsers,
                    CheckingAnswerExport.All
                );

                // User 3 is a PT user but does not have a role on this particular PT project, according to the PT
                // Registry. So we will attribute their comment to user 1, who does have a role on this project
                // according to the PT registry. Otherwise we would get errors when uploading a note attributed to user
                // 3's PT username since they do not have appropriate access to write a note. Also, NewSyncUsers will
                // not contain user 3.
                const string expectedNotesText =
                    @"
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
                        <thread id=""ANSWER_answer04"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 4 is marked for export</p>
                                </content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer05"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 5 is resolved</p>
                                </content>
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

                Assert.That(ptProjectUsers.Keys, Is.EquivalentTo(new[] { "PT User 1" }));
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
                const string oldNotesText =
                    @"
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
                Dictionary<string, ParatextUserProfile> ptProjectUsers = env.PtProjectUsers.ToDictionary(
                    u => u.Username
                );
                XElement notesElem = await env.Mapper.GetNotesChangelistAsync(
                    XElement.Parse(oldNotesText),
                    await env.GetQuestionDocsAsync(conn),
                    ptProjectUsers,
                    CheckingAnswerExport.All
                );

                const string expectedNotesText =
                    @"
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
                        <thread id=""ANSWER_answer04"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 3"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 4 is marked for export</p>
                                </content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer05"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 3"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 5 is resolved</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";
                Assert.That(XNode.DeepEquals(notesElem, XElement.Parse(expectedNotesText)), Is.True);
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
                const string oldNotesText =
                    @"
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
                Dictionary<string, ParatextUserProfile> ptProjectUsers = env.PtProjectUsers.ToDictionary(
                    u => u.Username
                );
                XElement notesElem = await env.Mapper.GetNotesChangelistAsync(
                    XElement.Parse(oldNotesText),
                    await env.GetQuestionDocsAsync(conn),
                    ptProjectUsers,
                    CheckingAnswerExport.All
                );

                const string expectedNotesText =
                    @"
                    <notes version=""1.1"">
                        <thread id=""ANSWER_answer01"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 3"" date=""2019-01-01T09:00:00.0000000+00:00"">
                                <content>Test comment 1.</content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer04"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 3"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 4 is marked for export</p>
                                </content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer05"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 3"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 5 is resolved</p>
                                </content>
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
            }
        }

        [Test]
        public async Task GetNotesChangelistAsync_ExportAllNotes()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(false, true);
            env.AddData(null, null, null, null);

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                const string oldNotesText = @"<notes version=""1.1""></notes>";
                Dictionary<string, ParatextUserProfile> ptProjectUsers = env.PtProjectUsers.ToDictionary(
                    u => u.Username
                );
                XElement notesElem = await env.Mapper.GetNotesChangelistAsync(
                    XElement.Parse(oldNotesText),
                    await env.GetQuestionDocsAsync(conn),
                    ptProjectUsers,
                    CheckingAnswerExport.All
                );

                const string expectedNotesText =
                    @"
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
                        <thread id=""ANSWER_answer04"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 4 is marked for export</p>
                                </content>
                            </comment>
                        </thread>
                        <thread id=""ANSWER_answer05"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 5 is resolved</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";
                Assert.That(XNode.DeepEquals(notesElem, XElement.Parse(expectedNotesText)), Is.True);
            }
        }

        [Test]
        public async Task GetNotesChangelistAsync_ExportNoNotes()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(false, true);
            env.AddData(null, null, null, null);

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                const string oldNotesText = @"<notes version=""1.1""></notes>";
                Dictionary<string, ParatextUserProfile> ptProjectUsers = env.PtProjectUsers.ToDictionary(
                    u => u.Username
                );
                XElement notesElem = await env.Mapper.GetNotesChangelistAsync(
                    XElement.Parse(oldNotesText),
                    await env.GetQuestionDocsAsync(conn),
                    ptProjectUsers,
                    CheckingAnswerExport.None
                );

                const string expectedNotesText = @"<notes version=""1.1"" />";
                Assert.That(XNode.DeepEquals(notesElem, XElement.Parse(expectedNotesText)), Is.True);
            }
        }

        [Test]
        public async Task GetNotesChangelistAsync_ExportOnlyExportableNotes()
        {
            var env = new TestEnvironment();
            env.SetParatextProjectRoles(true);
            await env.InitMapperAsync(false, true);
            env.AddData(null, null, null, null);

            using (IConnection conn = await env.RealtimeService.ConnectAsync())
            {
                const string oldNotesText = @"<notes version=""1.1""></notes>";
                Dictionary<string, ParatextUserProfile> ptProjectUsers = env.PtProjectUsers.ToDictionary(
                    u => u.Username
                );
                XElement notesElem = await env.Mapper.GetNotesChangelistAsync(
                    XElement.Parse(oldNotesText),
                    await env.GetQuestionDocsAsync(conn),
                    ptProjectUsers,
                    CheckingAnswerExport.MarkedForExport
                );

                const string expectedNotesText =
                    @"
                    <notes version=""1.1"">
                        <thread id=""ANSWER_answer04"">
                            <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                            <comment user=""PT User 1"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                                <content>
                                    <p><span style=""bold"">Test question?</span></p>
                                    <p>Test answer 4 is marked for export</p>
                                </content>
                            </comment>
                        </thread>
                    </notes>";
                Assert.That(XNode.DeepEquals(notesElem, XElement.Parse(expectedNotesText)), Is.True);
            }
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                UserSecrets = new MemoryRepository<UserSecret>(
                    new[]
                    {
                        new UserSecret { Id = "user01" },
                        new UserSecret { Id = "user03" }
                    }
                );

                RealtimeService = new SFMemoryRealtimeService();

                ParatextService = Substitute.For<IParatextService>();
                ParatextService.GetParatextUsername(Arg.Is<UserSecret>(u => u.Id == "user01")).Returns("PT User 1");
                ParatextService.GetParatextUsername(Arg.Is<UserSecret>(u => u.Id == "user03")).Returns("PT User 3");
                var options = Microsoft.Extensions.Options.Options.Create(
                    new LocalizationOptions { ResourcesPath = "Resources" }
                );
                var factory = new ResourceManagerStringLocalizerFactory(options, NullLoggerFactory.Instance);
                Localizer = new StringLocalizer<SharedResource>(factory);
                var siteOptions = Substitute.For<IOptions<SiteOptions>>();
                siteOptions.Value.Returns(new SiteOptions { Name = "xForge", });
                Mapper = new ParatextNotesMapper(
                    UserSecrets,
                    ParatextService,
                    Localizer,
                    siteOptions,
                    new TestGuidService()
                );
            }

            public ParatextNotesMapper Mapper { get; }
            public MemoryRepository<UserSecret> UserSecrets { get; }
            public SFMemoryRealtimeService RealtimeService { get; }
            public IParatextService ParatextService { get; }
            public IStringLocalizer<SharedResource> Localizer { get; }
            public IEnumerable<ParatextUserProfile> PtProjectUsers { get; set; }

            public async Task InitMapperAsync(bool includeSyncUsers, bool twoPtUsersOnProject)
            {
                SFProject project = Project(includeSyncUsers);
                PtProjectUsers = project.ParatextUsers;
                await Mapper.InitAsync(
                    UserSecrets.Get("user01"),
                    ProjectSecret(),
                    ParatextUsersOnProject(twoPtUsersOnProject),
                    project,
                    CancellationToken.None
                );
            }

            public void AddData(
                string answerSyncUserId1,
                string answerSyncUserId2,
                string commentSyncUserId1,
                string commentSyncUserId2,
                bool useAudioResponses = false
            )
            {
                RealtimeService.AddRepository(
                    "questions",
                    OTType.Json0,
                    new MemoryRepository<Question>(
                        new[]
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
                                    },
                                    new Answer
                                    {
                                        DataId = "answer04",
                                        OwnerRef = "user04",
                                        SyncUserRef = answerSyncUserId2,
                                        DateCreated = new DateTime(2019, 1, 2, 8, 0, 0, DateTimeKind.Utc),
                                        Text = "Test answer 4 is marked for export",
                                        VerseRef = new VerseRefData(40, 1, "2-3"),
                                        Status = AnswerStatus.Exportable
                                    },
                                    new Answer
                                    {
                                        DataId = "answer05",
                                        OwnerRef = "user04",
                                        SyncUserRef = answerSyncUserId2,
                                        DateCreated = new DateTime(2019, 1, 2, 8, 0, 0, DateTimeKind.Utc),
                                        Text = "Test answer 5 is resolved",
                                        VerseRef = new VerseRefData(40, 1, "2-3"),
                                        Status = AnswerStatus.Resolved
                                    }
                                }
                            }
                        }
                    )
                );
            }

            public async Task<IEnumerable<IDocument<Question>>> GetQuestionDocsAsync(IConnection conn)
            {
                IDocument<Question> questionDoc = await conn.FetchAsync<Question>("project01:question01");
                return new[] { questionDoc };
            }

            public async Task<IEnumerable<IDocument<NoteThread>>> GetNoteThreadDocsAsync(
                IConnection conn,
                string[] threadIds
            )
            {
                IDocument<NoteThread>[] noteThreadDocs = new IDocument<NoteThread>[threadIds.Length];
                var tasks = new List<Task>();
                for (int i = 0; i < threadIds.Length; i++)
                {
                    async Task fetchNoteThread(int index)
                    {
                        noteThreadDocs[index] = await conn.FetchAsync<NoteThread>("project01:" + threadIds[index]);
                    }
                    tasks.Add(fetchNoteThread(i));
                }
                await Task.WhenAll(tasks);
                return noteThreadDocs;
            }

            public void SetParatextProjectRoles(bool twoPtUserOnProject)
            {
                Dictionary<string, string> ptUserRoles = new Dictionary<string, string>();
                ptUserRoles["ptuser01"] = SFProjectRole.Administrator;
                if (twoPtUserOnProject)
                    ptUserRoles["ptuser03"] = SFProjectRole.Translator;
                ParatextService
                    .GetProjectRolesAsync(Arg.Any<UserSecret>(), Arg.Any<SFProject>(), Arg.Any<CancellationToken>())
                    .Returns(ptUserRoles);
            }

            private static SFProject Project(bool includeSyncUsers = true)
            {
                var ptProjectUsers = new List<ParatextUserProfile>();
                if (includeSyncUsers)
                {
                    ptProjectUsers.Add(new ParatextUserProfile { OpaqueUserId = "syncuser01", Username = "PT User 1" });
                    ptProjectUsers.Add(new ParatextUserProfile { OpaqueUserId = "syncuser03", Username = "PT User 3" });
                }
                return new SFProject
                {
                    Id = "project01",
                    ParatextId = "paratextId",
                    ParatextUsers = ptProjectUsers
                };
            }

            private static SFProjectSecret ProjectSecret()
            {
                return new SFProjectSecret { Id = "project01", };
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
