using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class ParatextNotesMapperTests
    {
        [Test]
        public async Task GetNotesChangelistAsync_AddNotes()
        {
            var env = new TestEnvironment();
            env.InitMapper(false);

            const string oldNotesText = @"
                <notes version=""1.1"">
                    <thread id=""ANSWER_answer03"">
                        <selection verseRef=""MAT 1:2"" startPos=""0"" selectedText="""" />
                        <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-03T08:00:00.0000000+00:00"">
                            <content>
                                <p><span style=""italic"">Test question?</span></p>
                                <p>Test answer 3.</p>
                            </content>
                        </comment>
                    </thread>
                </notes>";
            XElement notesElem = await env.Mapper.GetNotesChangelistAsync(XElement.Parse(oldNotesText),
                QuestionsDocs(null, null), CommentsDocs(null, null));

            const string expectedNotesText = @"
                <notes version=""1.1"">
                    <thread id=""ANSWER_answer01"">
                        <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                        <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"">
                            <content>
                                <p><span style=""italic"">Test question?</span></p>
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
                                <p><span style=""italic"">Test question?</span></p>
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
                                <p><span style=""italic"">Test question?</span></p>
                                <p>Test answer 3.</p>
                            </content>
                        </comment>
                    </thread>
                </notes>";
            Assert.That(XNode.DeepEquals(notesElem, XElement.Parse(expectedNotesText)), Is.True);

            Assert.That(env.Mapper.NewSyncUsers.Select(su => su.ParatextUsername),
                Is.EquivalentTo(new[] { "PT User 1", "PT User 3" }));
        }

        [Test]
        public async Task GetNotesChangelistAsync_UpdateNotes()
        {
            var env = new TestEnvironment();
            env.InitMapper(true);

            const string oldNotesText = @"
                <notes version=""1.1"">
                    <thread id=""ANSWER_answer01"">
                        <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                        <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"">
                            <content>
                                <p><span style=""italic"">Test question?</span></p>
                                <p>Old test answer 1.</p>
                            </content>
                        </comment>
                    </thread>
                    <thread id=""ANSWER_answer02"">
                        <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                        <comment user=""PT User 3"" extUser=""user04"" date=""2019-01-02T08:00:00.0000000+00:00"">
                            <content>
                                <p><span style=""italic"">Test question?</span></p>
                                <p>Test answer 2.</p>
                            </content>
                        </comment>
                        <comment user=""PT User 3"" extUser=""user02"" date=""2019-01-02T09:00:00.0000000+00:00"">
                            <content>Old test comment 2.</content>
                        </comment>
                    </thread>
                </notes>";
            XElement notesElem = await env.Mapper.GetNotesChangelistAsync(XElement.Parse(oldNotesText),
                QuestionsDocs("syncuser01", "syncuser03"), CommentsDocs(null, "syncuser03"));

            const string expectedNotesText = @"
                <notes version=""1.1"">
                    <thread id=""ANSWER_answer01"">
                        <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                        <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"">
                            <content>
                                <p><span style=""italic"">Test question?</span></p>
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

        [Test]
        public async Task GetNotesChangelistAsync_DeleteNotes()
        {
            var env = new TestEnvironment();
            env.InitMapper(true);

            const string oldNotesText = @"
                <notes version=""1.1"">
                    <thread id=""ANSWER_answer01"">
                        <selection verseRef=""MAT 1:1"" startPos=""0"" selectedText="""" />
                        <comment user=""PT User 1"" extUser=""user02"" date=""2019-01-01T08:00:00.0000000+00:00"">
                            <content>
                                <p><span style=""italic"">Test question?</span></p>
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
                                <p><span style=""italic"">Test question?</span></p>
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
                                <p><span style=""italic"">Test question?</span></p>
                                <p>Test answer 3.</p>
                            </content>
                        </comment>
                    </thread>
                </notes>";
            XElement notesElem = await env.Mapper.GetNotesChangelistAsync(XElement.Parse(oldNotesText),
                QuestionsDocs("syncuser01", "syncuser03"), CommentsDocs("syncuser03", "syncuser03"));

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
                                <p><span style=""italic"">Test question?</span></p>
                                <p>Test answer 3.</p>
                            </content>
                        </comment>
                    </thread>
                </notes>";
            Assert.That(XNode.DeepEquals(notesElem, XElement.Parse(expectedNotesText)), Is.True);

            Assert.That(env.Mapper.NewSyncUsers, Is.Empty);
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                Users = new MemoryRepository<UserEntity>(new[]
                    {
                        new UserEntity { Id = "user01", ParatextId = "paratextuser01" },
                        new UserEntity { Id = "user02" },
                        new UserEntity { Id = "user03", ParatextId = "paratextuser03" },
                        new UserEntity { Id = "user04" }
                    });

                var paratextService = Substitute.For<IParatextService>();
                paratextService.GetParatextUsername(Arg.Is<UserEntity>(u => u.Id == "user01")).Returns("PT User 1");
                paratextService.GetParatextUsername(Arg.Is<UserEntity>(u => u.Id == "user03")).Returns("PT User 3");
                Mapper = new ParatextNotesMapper(Users, paratextService);
            }

            public ParatextNotesMapper Mapper { get; }
            public MemoryRepository<UserEntity> Users { get; }

            public void InitMapper(bool includeSyncUsers)
            {
                Mapper.Init(Users.Get("user01"), Project(includeSyncUsers));
            }

            private static SFProjectEntity Project(bool includeSyncUsers)
            {
                var syncUsers = new List<SyncUser>();
                if (includeSyncUsers)
                {
                    syncUsers.Add(new SyncUser { Id = "syncuser01", ParatextUsername = "PT User 1" });
                    syncUsers.Add(new SyncUser { Id = "syncuser03", ParatextUsername = "PT User 3" });
                }

                return new SFProjectEntity
                {
                    Id = "project01",
                    SyncUsers = syncUsers.ToList()
                };
            }
        }

        private static IEnumerable<IDocument<List<Question>>> QuestionsDocs(string syncUserId1, string syncUserId2)
        {
            var questions = new List<Question>
            {
                new Question
                {
                    Id = "question01",
                    ScriptureStart = new VerseRefData("MAT", "1", "1"),
                    Text = "Test question?",
                    Answers =
                    {
                        new Answer
                        {
                            Id = "answer01",
                            OwnerRef = "user02",
                            SyncUserRef = syncUserId1,
                            DateCreated = new DateTime(2019, 1, 1, 8, 0, 0, DateTimeKind.Utc),
                            Text = "Test answer 1."
                        },
                        new Answer
                        {
                            Id = "answer02",
                            OwnerRef = "user04",
                            SyncUserRef = syncUserId2,
                            DateCreated = new DateTime(2019, 1, 2, 8, 0, 0, DateTimeKind.Utc),
                            Text = "Test answer 2."
                        }
                    }
                }
            };
            var doc = Substitute.For<IDocument<List<Question>>>();
            doc.IsLoaded.Returns(true);
            doc.Data.Returns(questions);
            doc.SubmitOpAsync(Arg.Any<object>()).Returns(Task.CompletedTask);
            yield return doc;
        }

        private static IEnumerable<IDocument<List<Comment>>> CommentsDocs(string syncUserId1, string syncUserId2)
        {
            var comments = new List<Comment>
            {
                new Comment
                {
                    Id = "comment01",
                    OwnerRef = "user03",
                    SyncUserRef = syncUserId1,
                    AnswerRef = "answer01",
                    DateCreated = new DateTime(2019, 1, 1, 9, 0, 0, DateTimeKind.Utc),
                    Text = "Test comment 1."
                },
                new Comment
                {
                    Id = "comment02",
                    OwnerRef = "user02",
                    SyncUserRef = syncUserId2,
                    AnswerRef = "answer02",
                    DateCreated = new DateTime(2019, 1, 2, 9, 0, 0, DateTimeKind.Utc),
                    Text = "Test comment 2."
                }
            };
            var doc = Substitute.For<IDocument<List<Comment>>>();
            doc.IsLoaded.Returns(true);
            doc.Data.Returns(comments);
            doc.SubmitOpAsync(Arg.Any<object>()).Returns(Task.CompletedTask);
            yield return doc;
        }
    }
}
