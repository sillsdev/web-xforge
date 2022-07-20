using System;
using System.Linq;
using MongoDB.Bson;
using NUnit.Framework;
using SIL.Machine.Tokenization;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class SFScriptureTextTests
    {
        [Test]
        public void Create_HasDocOps_HasSegments()
        {
            // Make a BsonDocument that looks like data
            // from SF DB - xforge - texts.
            var doc = new BsonDocument
            {
                { "_id", "abc123:MAT:1:target" },
                {
                    "ops",
                    new BsonArray
                    {
                        new BsonDocument
                        {
                            {
                                "insert",
                                new BsonDocument
                                {
                                    {
                                        "chapter",
                                        new BsonDocument { { "number", "1" }, { "style", "c" } }
                                    }
                                }
                            }
                        },
                        new BsonDocument
                        {
                            {
                                "insert",
                                new BsonDocument
                                {
                                    {
                                        "verse",
                                        new BsonDocument { { "number", "1" }, { "style", "v" } }
                                    }
                                }
                            }
                        },
                        new BsonDocument
                        {
                            { "insert", "First verse text here" },
                            {
                                "attributes",
                                new BsonDocument { { "segment", "verse_1_1" } }
                            }
                        }
                    }
                }
            };
            var numberOps = 3;
            var numberSegments = 1;
            var bookNumber = 40;
            var chapterNumber = 1;
            var projectId = "myProject";
            Assert.That(((BsonArray)doc["ops"]).Count, Is.EqualTo(numberOps), "Setup");
            var tokenizer = new LatinWordTokenizer();

            // SUT
            var text = new SFScriptureText(tokenizer, projectId, bookNumber, chapterNumber, doc);

            Assert.That(text.Id, Is.EqualTo($"{projectId}_{bookNumber}_{chapterNumber}"));
            Assert.That(text.GetSegments().Count(), Is.EqualTo(numberSegments));
        }

        [Test]
        public void Create_NoSegments_EmptySegments()
        {
            var doc = new BsonDocument
            {
                { "_id", "abc123:MAT:1:target" },
                {
                    "ops",
                    new BsonArray
                    {
                        new BsonDocument
                        {
                            {
                                "insert",
                                new BsonDocument
                                {
                                    {
                                        "chapter",
                                        new BsonDocument { { "number", "1" }, { "style", "c" } }
                                    }
                                }
                            }
                        },
                        new BsonDocument
                        {
                            {
                                "insert",
                                new BsonDocument
                                {
                                    {
                                        "verse",
                                        new BsonDocument { { "number", "1" }, { "style", "v" } }
                                    }
                                }
                            }
                        }
                        // No verse text inserts with a segment reference.
                    }
                }
            };
            var numberOps = 2;
            var numberSegments = 0;
            var bookNumber = 40;
            var chapterNumber = 1;
            var projectId = "myProject";
            Assert.That(((BsonArray)doc["ops"]).Count, Is.EqualTo(numberOps), "Setup");
            var tokenizer = new LatinWordTokenizer();

            // SUT
            var text = new SFScriptureText(tokenizer, projectId, bookNumber, chapterNumber, doc);

            Assert.That(text.Id, Is.EqualTo($"{projectId}_{bookNumber}_{chapterNumber}"));
            Assert.That(text.GetSegments().Count(), Is.EqualTo(numberSegments));
        }

        [Test]
        public void Create_EmptyOps_EmptySegments()
        {
            var doc = new BsonDocument
            {
                { "_id", "abc123:MAT:1:target" },
                {
                    "ops",
                    new BsonArray
                    {
                        // Empty ops array
                    }
                }
            };
            var numberOps = 0;
            var numberSegments = 0;
            var bookNumber = 40;
            var chapterNumber = 1;
            var projectId = "myProject";
            Assert.That(((BsonArray)doc["ops"]).Count, Is.EqualTo(numberOps), "Setup");
            var tokenizer = new LatinWordTokenizer();

            // SUT
            var text = new SFScriptureText(tokenizer, projectId, bookNumber, chapterNumber, doc);

            Assert.That(text.Id, Is.EqualTo($"{projectId}_{bookNumber}_{chapterNumber}"));
            Assert.That(text.GetSegments().Count(), Is.EqualTo(numberSegments));
        }

        [Test]
        public void Create_NullDoc_Crash()
        {
            BsonDocument doc = null;
            var bookNumber = 40;
            var chapterNumber = 1;
            var projectId = "myProject";
            var tokenizer = new LatinWordTokenizer();

            // SUT
            Assert.Throws<ArgumentNullException>(
                () => new SFScriptureText(tokenizer, projectId, bookNumber, chapterNumber, doc)
            );
        }

        [Test]
        public void Create_MissingOps_Crash()
        {
            var doc = new BsonDocument
            {
                { "_id", "abc123:MAT:1:target" },
                // Missing ops
            };
            var bookNumber = 40;
            var chapterNumber = 1;
            var projectId = "myProject";
            Assert.That(doc.Contains("ops"), Is.False, "Setup");
            var tokenizer = new LatinWordTokenizer();

            // SUT
            Assert.Throws<ArgumentException>(
                () => new SFScriptureText(tokenizer, projectId, bookNumber, chapterNumber, doc)
            );
        }
    }
}
