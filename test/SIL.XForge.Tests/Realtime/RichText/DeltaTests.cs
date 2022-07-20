using Newtonsoft.Json.Linq;
using NUnit.Framework;
using System.Collections.Generic;
using System.Linq;

namespace SIL.XForge.Realtime.RichText
{
    [TestFixture]
    public class DeltaTests
    {
        [Test]
        public void Insert_EmptyText_EmptyOps()
        {
            var delta = Delta.New().Insert("");
            Assert.That(delta.Ops, Is.Empty);
        }

        [Test]
        public void Insert_Text_OneOp()
        {
            var delta = Delta.New().Insert("test");
            Assert.That(delta.Ops, Is.EqualTo(Objs(new { insert = "test" })));
        }

        [Test]
        public void Insert_ConsecutiveTexts_MergeOps()
        {
            var delta = Delta.New().Insert("a").Insert("b");
            Assert.That(delta.Ops, Is.EqualTo(Objs(new { insert = "ab" })));
        }

        [Test]
        public void Insert_ConsecutiveTextsMatchingAttrs_MergeOps()
        {
            var delta = Delta.New().Insert("a", new { bold = true }).Insert("b", new { bold = true });
            Assert.That(delta.Ops, Is.EqualTo(Objs(new { insert = "ab", attributes = new { bold = true } })));
        }

        [Test]
        public void Insert_ConsecutiveTextsDifferentAttrs_TwoOps()
        {
            var delta = Delta.New().Insert("a", new { bold = true }).Insert("b");
            Assert.That(
                delta.Ops,
                Is.EqualTo(Objs(new { insert = "a", attributes = new { bold = true } }, new { insert = "b" }))
            );
        }

        [Test]
        public void Insert_ConsecutiveEmbedsMatchingAttrs_TwoOps()
        {
            var delta = Delta
                .New()
                .Insert(1, new { alt = "Description" })
                .Insert(new { url = "http://quilljs.com" }, new { alt = "Description" });
            Assert.That(
                delta.Ops,
                Is.EqualTo(
                    Objs(
                        new { insert = 1, attributes = new { alt = "Description" } },
                        new { insert = new { url = "http://quilljs.com" }, attributes = new { alt = "Description" } }
                    )
                )
            );
        }

        [Test]
        public void Insert_TextAttributes_OneOp()
        {
            var attrs = new { bold = true };
            var delta = Delta.New().Insert("test", attrs);
            Assert.That(delta.Ops, Is.EqualTo(Objs(new { insert = "test", attributes = attrs })));
        }

        [Test]
        public void Insert_Embed_OneOp()
        {
            var delta = Delta.New().Insert(1);
            Assert.That(delta.Ops, Is.EqualTo(Objs(new { insert = 1 })));
        }

        [Test]
        public void Insert_EmbedAttributes_OneOp()
        {
            var attrs = new { url = "http://quilljs.com", alt = "Quill" };
            var delta = Delta.New().Insert(1, attrs);
            Assert.That(delta.Ops, Is.EqualTo(Objs(new { insert = 1, attributes = attrs })));
        }

        [Test]
        public void Insert_ObjEmbedAttributes_OneOp()
        {
            var embed = new { url = "http://quilljs.com" };
            var attrs = new { alt = "Quill" };
            var delta = Delta.New().Insert(embed, attrs);
            Assert.That(delta.Ops, Is.EqualTo(Objs(new { insert = embed, attributes = attrs })));
        }

        [Test]
        public void Insert_AfterDelete_SwapOps()
        {
            var delta = Delta.New().Delete(1).Insert("a");
            var expected = Delta.New().Insert("a").Delete(1);
            Assert.That(delta, Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Insert_AfterDeleteWithMerge_MergeOps()
        {
            var delta = Delta.New().Insert("a").Delete(1).Insert("b");
            var expected = Delta.New().Insert("ab").Delete(1);
            Assert.That(delta, Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Insert_AfterDeleteNoMerge_SwapOps()
        {
            var delta = Delta.New().Insert(1).Delete(1).Insert("a");
            var expected = Delta.New().Insert(1).Insert("a").Delete(1);
            Assert.That(delta, Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Insert_EmptyAttributes_IgnoreAttributes()
        {
            var delta = Delta.New().Insert("a", new { });
            var expected = Delta.New().Insert("a");
            Assert.That(delta, Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Retain_Zero_EmptyOps()
        {
            var delta = Delta.New().Retain(0);
            Assert.That(delta.Ops, Is.Empty);
        }

        [Test]
        public void Retain_Positive_OneOp()
        {
            var delta = Delta.New().Retain(2);
            Assert.That(delta.Ops, Is.EqualTo(Objs(new { retain = 2 })));
        }

        [Test]
        public void Retain_Attributes_OneOp()
        {
            var attrs = new { bold = true };
            var delta = Delta.New().Retain(1, attrs);
            Assert.That(delta.Ops, Is.EqualTo(Objs(new { retain = 1, attributes = attrs })));
        }

        [Test]
        public void Retain_ConsecutiveRetainsMatchingAttrs_MergeOps()
        {
            var delta = Delta.New().Retain(1, new { bold = true }).Retain(3, new { bold = true });
            Assert.That(delta.Ops, Is.EqualTo(Objs(new { retain = 4, attributes = new { bold = true } })));
        }

        [Test]
        public void Retain_ConsecutiveRetainsDifferentAttrs_TwoOps()
        {
            var delta = Delta.New().Retain(1, new { bold = true }).Retain(3);
            Assert.That(
                delta.Ops,
                Is.EqualTo(Objs(new { retain = 1, attributes = new { bold = true } }, new { retain = 3 }))
            );
        }

        [Test]
        public void Retain_EmptyAttributes_IgnoreAttributes()
        {
            var delta = Delta.New().Retain(2, new { }).Delete(1);
            var expected = Delta.New().Retain(2).Delete(1);
            Assert.That(delta, Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Delete_Zero_EmptyOps()
        {
            var delta = Delta.New().Delete(0);
            Assert.That(delta.Ops, Is.Empty);
        }

        [Test]
        public void Delete_Positive_OneOp()
        {
            var delta = Delta.New().Delete(1);
            Assert.That(delta.Ops, Is.EqualTo(Objs(new { delete = 1 })));
        }

        [Test]
        public void Delete_ConsecutiveDeletes_MergeOps()
        {
            var delta = Delta.New().Delete(2).Delete(3);
            Assert.That(delta.Ops, Is.EqualTo(Objs(new { delete = 5 })));
        }

        [Test]
        public void Compose_InsertInsert_TwoOps()
        {
            var a = Delta.New().Insert("A");
            var b = Delta.New().Insert("B");
            var expected = Delta.New().Insert("B").Insert("A");
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_InsertRetain_MergeOps()
        {
            var a = Delta.New().Insert("A");
            var b = Delta.New().Retain(1, new { bold = true, color = "red", font = (string)null });
            var expected = Delta.New().Insert("A", new { bold = true, color = "red" });
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_InsertDelete_MergeOps()
        {
            var a = Delta.New().Insert("A");
            var b = Delta.New().Delete(1);
            var expected = Delta.New();
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_DeleteInsert_TwoOps()
        {
            var a = Delta.New().Delete(1);
            var b = Delta.New().Insert("B");
            var expected = Delta.New().Insert("B").Delete(1);
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_DeleteRetain_TwoOps()
        {
            var a = Delta.New().Delete(1);
            var b = Delta.New().Retain(1, new { bold = true, color = "red" });
            var expected = Delta.New().Delete(1).Retain(1, new { bold = true, color = "red" });
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_DeleteDelete_MergeOps()
        {
            var a = Delta.New().Delete(1);
            var b = Delta.New().Delete(1);
            var expected = Delta.New().Delete(2);
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_RetainInsert_TwoOps()
        {
            var a = Delta.New().Retain(1, new { color = "blue" });
            var b = Delta.New().Insert("B");
            var expected = Delta.New().Insert("B").Retain(1, new { color = "blue" });
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_RetainRetain_MergeOps()
        {
            var a = Delta.New().Retain(1, new { color = "blue" });
            var b = Delta.New().Retain(1, new { bold = true, color = "red", font = (string)null });
            var expected = Delta.New().Retain(1, new { bold = true, color = "red", font = (string)null });
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_RetainDelete_MergeOps()
        {
            var a = Delta.New().Retain(1, new { color = "blue" });
            var b = Delta.New().Delete(1);
            var expected = Delta.New().Delete(1);
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_InsertInMiddle_MergeOps()
        {
            var a = Delta.New().Insert("Hello");
            var b = Delta.New().Retain(3).Insert("X");
            var expected = Delta.New().Insert("HelXlo");
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_InsertDeleteOrdering_MergeOps()
        {
            var a = Delta.New().Insert("Hello");
            var b = Delta.New().Insert("Hello");
            var insertFirst = Delta.New().Retain(3).Insert("X").Delete(1);
            var deleteFirst = Delta.New().Retain(3).Delete(1).Insert("X");
            var expected = Delta.New().Insert("HelXo");
            Assert.That(a.Compose(insertFirst), Is.EqualTo(expected).Using(Delta.EqualityComparer));
            Assert.That(b.Compose(deleteFirst), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_InsertEmbedRetain_MergeOps()
        {
            var a = Delta.New().Insert(1, new { src = "http://quilljs.com/image.png" });
            var b = Delta.New().Retain(1, new { alt = "logo" });
            var expected = Delta.New().Insert(1, new { src = "http://quilljs.com/image.png", alt = "logo" });
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_DeleteEntireText_MergeOps()
        {
            var a = Delta.New().Retain(4).Insert("Hello");
            var b = Delta.New().Delete(9);
            var expected = Delta.New().Delete(4);
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_RetainMoreThanText_MergeOps()
        {
            var a = Delta.New().Insert("Hello");
            var b = Delta.New().Retain(10);
            var expected = Delta.New().Insert("Hello");
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_RetainEmbed_MergeOps()
        {
            var a = Delta.New().Insert(1);
            var b = Delta.New().Retain(1);
            var expected = Delta.New().Insert(1);
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_RemoveAttributes_MergeOps()
        {
            var a = Delta.New().Insert("A", new { bold = true });
            var b = Delta.New().Retain(1, new { bold = (bool?)null });
            var expected = Delta.New().Insert("A");
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_RemoveEmbedAttributes_MergeOps()
        {
            var a = Delta.New().Insert(2, new { bold = true });
            var b = Delta.New().Retain(1, new { bold = (bool?)null });
            var expected = Delta.New().Insert(2);
            Assert.That(a.Compose(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Compose_Immutability()
        {
            JToken attr1 = Obj(new { bold = true });
            JToken attr2 = Obj(new { bold = true });
            var a1 = Delta.New().Insert("Test", attr1);
            var a2 = Delta.New().Insert("Test", attr1);
            var b1 = Delta.New().Retain(1, new { color = "red" }).Delete(2);
            var b2 = Delta.New().Retain(1, new { color = "red" }).Delete(2);
            var expected = Delta.New().Insert("T", new { color = "red", bold = true }).Insert("t", attr1);
            Assert.That(a1.Compose(b1), Is.EqualTo(expected).Using(Delta.EqualityComparer));
            Assert.That(a1, Is.EqualTo(a2).Using(Delta.EqualityComparer));
            Assert.That(b1, Is.EqualTo(b2).Using(Delta.EqualityComparer));
            Assert.That(attr1, Is.EqualTo(attr2));
        }

        [Test]
        public void Diff_Insert()
        {
            var a = Delta.New().Insert("A");
            var b = Delta.New().Insert("AB");
            var expected = Delta.New().Retain(1).Insert("B");
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_Delete()
        {
            var a = Delta.New().Insert("AB");
            var b = Delta.New().Insert("A");
            var expected = Delta.New().Retain("A".Length).Delete("B".Length);
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_Empty()
        {
            var a = Delta.New().Insert("AB");
            var b = Delta.New();
            var expected = Delta.New().Delete("AB".Length);
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_Null()
        {
            var a = Delta.New().Insert("AB");
            Delta b = null;
            Assert.That(() => a.Diff(b), Throws.ArgumentNullException);
        }

        [Test]
        public void Diff_Retain()
        {
            var a = Delta.New().Insert("A");
            var b = Delta.New().Insert("A");
            var expected = Delta.New();
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_Format()
        {
            var a = Delta.New().Insert("A");
            var b = Delta.New().Insert("A", new { bold = true });
            var expected = Delta.New().Retain(1, new { bold = true });
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_ObjectAttributes()
        {
            var a = Delta.New().Insert("A", new { font = new { family = "Helvetica", size = "15px" } });
            var b = Delta.New().Insert("A", new { font = new { family = "Helvetica", size = "15px" } });
            var expected = Delta.New();
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_EmbedIntegerMatch()
        {
            var a = Delta.New().Insert(1);
            var b = Delta.New().Insert(1);
            var expected = Delta.New();
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_EmbedIntegerMismatch()
        {
            var a = Delta.New().Insert(1);
            var b = Delta.New().Insert(2);
            var expected = Delta.New().Delete(1).Insert(2);
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_EmbedObjectMatch()
        {
            var a = Delta.New().Insert(new { image = "http://quilljs.com" });
            var b = Delta.New().Insert(new { image = "http://quilljs.com" });
            var expected = Delta.New();
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_EmbedObjectMismatch()
        {
            var a = Delta.New().Insert(new { image = "http://quilljs.com", alt = "Overwrite" });
            var b = Delta.New().Insert(new { image = "http://quilljs.com" });
            var expected = Delta.New().Insert(new { image = "http://quilljs.com" }).Delete(1);
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_EmbedObjectChange()
        {
            JObject embed = Obj(new { image = "http://quilljs.com" });
            var a = Delta.New().Insert(embed);
            embed["image"] = "http://github.com";
            var b = Delta.New().Insert(embed);
            var expected = Delta.New().Insert(new { image = "http://github.com" }).Delete(1);
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_EmbedFalsePositive()
        {
            var a = Delta.New().Insert(1);
            var b = Delta.New().Insert("\0");
            var expected = Delta.New().Insert("\0").Delete(1);
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_ThrowsOnNonDocuments()
        {
            var a = Delta.New().Insert("A");
            var b = Delta.New().Retain(1).Insert("B");
            Assert.That(() => a.Diff(b), Throws.InvalidOperationException);
            Assert.That(() => b.Diff(a), Throws.InvalidOperationException);
        }

        [Test]
        public void Diff_InconvenientIndices()
        {
            var a = Delta.New().Insert("12", new { bold = true }).Insert("34", new { italic = true });
            var b = Delta.New().Insert("123", new { color = "red" });
            var expected = Delta
                .New()
                .Retain(2, new { bold = (bool?)null, color = "red" })
                .Retain(1, new { italic = (bool?)null, color = "red" })
                .Delete(1);
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_Combination()
        {
            var a = Delta.New().Insert("Bad", new { color = "red" }).Insert("cat", new { color = "blue" });
            var b = Delta.New().Insert("Good", new { bold = true }).Insert("dog", new { italic = true });
            var expected = Delta
                .New()
                .Insert("Good", new { bold = true })
                .Delete(2)
                .Retain(1, new { italic = true, color = (string)null })
                .Delete(3)
                .Insert("og", new { italic = true });
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_SameDocument()
        {
            var a = Delta.New().Insert("A").Insert("B", new { bold = true });
            var expected = Delta.New();
            Assert.That(a.Diff(a), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_Immutability()
        {
            JToken attr1 = Obj(new { color = "red" });
            JToken attr2 = Obj(new { color = "red" });
            var a1 = Delta.New().Insert("A", attr1);
            var a2 = Delta.New().Insert("A", attr1);
            var b1 = Delta.New().Insert("A", new { bold = true }).Insert("B");
            var b2 = Delta.New().Insert("A", new { bold = true }).Insert("B");
            var expected = Delta.New().Retain(1, new { bold = true, color = (string)null }).Insert("B");
            Assert.That(a1.Diff(b1), Is.EqualTo(expected).Using(Delta.EqualityComparer));
            Assert.That(a1, Is.EqualTo(a2).Using(Delta.EqualityComparer));
            Assert.That(b1, Is.EqualTo(b2).Using(Delta.EqualityComparer));
            Assert.That(attr1, Is.EqualTo(attr2));
        }

        [Test]
        public void Diff_CharAttributeObject()
        {
            JObject charObjA = new JObject(new JProperty("char", new JObject(new JProperty("cid", "123"))));
            JObject charObjB = new JObject(new JProperty("char", new JObject(new JProperty("cid", "456"))));
            var a = Delta.New().Insert("A", charObjA);
            var b = Delta.New().Insert("A", charObjB);
            var expected = Delta.New();
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_CharAttributeObjectChanged()
        {
            JObject charObjA = new JObject(
                new JProperty("char", new JObject(new JProperty("style", "it"), new JProperty("cid", "123")))
            );
            JObject charObjB = new JObject(
                new JProperty("char", new JObject(new JProperty("style", "fr"), new JProperty("cid", "456")))
            );
            var a = Delta.New().Insert("A", charObjA);
            var b = Delta.New().Insert("A", charObjB);
            var expected = Delta.New().Retain(1, charObjB);
            Assert.That(a.Diff(b), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_ArrayOfCharAttributeObjects()
        {
            // The path to the cid can look like insert.note.contents.ops[i].attributes.char.cid
            JObject a1 = new JObject(
                new JProperty("insert", "text1"),
                new JProperty(
                    "attributes",
                    new JObject(new JProperty("char", new JObject(new JProperty("cid", "123"))))
                )
            );
            JObject b1 = new JObject(
                new JProperty(
                    "attributes",
                    new JObject(new JProperty("char", new JObject(new JProperty("cid", "456"))))
                )
            );
            JObject a2 = new JObject(
                new JProperty("insert", "text1"),
                new JProperty(
                    "attributes",
                    new JObject(new JProperty("char", new JObject(new JProperty("cid", "234"))))
                )
            );
            JObject b2 = new JObject(
                new JProperty(
                    "attributes",
                    new JObject(new JProperty("char", new JObject(new JProperty("cid", "567"))))
                )
            );

            JObject obj1 = new JObject(new JProperty("ops", new JArray(a1, b1)));
            JObject obj2 = new JObject(new JProperty("ops", new JArray(a2, b2)));
            var del1 = Delta.New().Insert(obj1);
            var del2 = Delta.New().Insert(obj2);
            var expected = Delta.New();
            Assert.That(del1.Diff(del2), Is.EqualTo(expected).Using(Delta.EqualityComparer));
        }

        [Test]
        public void Diff_ArrayOfCharAttributeObjectsChanged()
        {
            // The path to the cid can look like insert.note.contents.ops[i].attributes.char.cid
            JObject a1 = new JObject(
                new JProperty("insert", "text1"),
                new JProperty(
                    "attributes",
                    new JObject(new JProperty("char", new JObject(new JProperty("cid", "123"))))
                )
            );
            JObject b1 = new JObject(
                new JProperty(
                    "attributes",
                    new JObject(new JProperty("char", new JObject(new JProperty("cid", "456"))))
                )
            );
            JObject a2 = new JObject(
                new JProperty("insert", "text2"),
                new JProperty(
                    "attributes",
                    new JObject(new JProperty("char", new JObject(new JProperty("cid", "234"))))
                )
            );
            JObject b2 = new JObject(
                new JProperty(
                    "attributes",
                    new JObject(new JProperty("char", new JObject(new JProperty("cid", "567"))))
                )
            );

            JObject obj1 = new JObject(new JProperty("ops", new JArray(a1, b1)));
            JObject obj2 = new JObject(new JProperty("ops", new JArray(a2, b2)));
            var del1 = Delta.New().Insert(obj1);
            var del2 = Delta.New().Insert(obj2);
            JObject expectedObj = new JObject(
                new JProperty("insert", "text2"),
                new JProperty(
                    "attributes",
                    new JObject(new JProperty("char", new JObject(new JProperty("cid", "234"))))
                )
            );
            Delta result = del1.Diff(del2);
            JToken resultToken = ((JObject)result.Ops.First(o => o.Type == JTokenType.Object))["insert"]["ops"];
            Assert.That(JToken.DeepEquals(resultToken[0], expectedObj));
        }

        [Test]
        public void Diff_CharIdUpdatedForTextInsertDiffDelta()
        {
            // The path to the cid can look like attributes.char.cid for usfm text formatting
            JObject obj1Attr = new JObject(new JProperty("char", new JObject(new JProperty("cid", "123"))));
            JObject obj2Attr = new JObject(new JProperty("char", new JObject(new JProperty("cid", "456"))));

            var oldDel = Delta.New().Insert("text1", obj1Attr);
            var newDel = Delta.New().Insert("text with edits 1", obj2Attr);

            var length1 = "text".Length;
            var length3 = "1".Length;
            JObject expectedObj1 = new JObject(
                new JProperty("retain", length1),
                new JProperty(
                    "attributes",
                    new JObject(new JProperty("char", new JObject(new JProperty("cid", "456"))))
                )
            );
            JObject expectedObj2 = new JObject(
                new JProperty("insert", " with edits "),
                new JProperty(
                    "attributes",
                    new JObject(new JProperty("char", new JObject(new JProperty("cid", "456"))))
                )
            );
            JObject expectedObj3 = new JObject(
                new JProperty("retain", length3),
                new JProperty(
                    "attributes",
                    new JObject(new JProperty("char", new JObject(new JProperty("cid", "456"))))
                )
            );

            Delta result = oldDel.Diff(newDel);
            Assert.That(result.Ops.Count, Is.EqualTo(3));
            Assert.That(JToken.DeepEquals(result.Ops[0], expectedObj1), Is.True);
            Assert.That(JToken.DeepEquals(result.Ops[1], expectedObj2), Is.True);
            Assert.That(JToken.DeepEquals(result.Ops[2], expectedObj3), Is.True);
        }

        [Test]
        public void Diff_CharIdUpdatedForTextFormattingDiffDelta()
        {
            // The path to the cid can look like attributes.char[0].cid for usfm text formatting
            JObject obj1Attr = new JObject(
                new JProperty("char", new JObject(new JProperty("cid", "123"), new JProperty("style", "wj")))
            );
            JObject obj2Attr1 = new JObject(
                new JProperty("char", new JObject(new JProperty("cid", "456"), new JProperty("style", "wj")))
            );
            JObject obj2Attr2 = new JObject(
                new JProperty(
                    "char",
                    new JArray(
                        new JObject(new JProperty("cid", "456"), new JProperty("style", "wj")),
                        new JObject(new JProperty("cid", "789"), new JProperty("style", "w"))
                    )
                )
            );

            var oldDel = Delta.New().Insert("Words of Jesus.", obj1Attr);
            var newDel = Delta.New().Insert("Words of ", obj2Attr1).Insert("Jesus", obj2Attr2).Insert(".", obj2Attr1);

            var length1 = "Words of ".Length;
            var length2 = "Jesus".Length;
            var length3 = ".".Length;
            JObject expectedObj1 = new JObject(
                new JProperty("retain", length1),
                new JProperty(
                    "attributes",
                    new JObject(
                        new JProperty("char", new JObject(new JProperty("cid", "456"), new JProperty("style", "wj")))
                    )
                )
            );
            JObject expectedObj2 = new JObject(
                new JProperty("retain", length2),
                new JProperty(
                    "attributes",
                    new JObject(
                        new JProperty(
                            "char",
                            new JArray(
                                new JObject(new JProperty("cid", "456"), new JProperty("style", "wj")),
                                new JObject(new JProperty("cid", "789"), new JProperty("style", "w"))
                            )
                        )
                    )
                )
            );
            JObject expectedObj3 = new JObject(
                new JProperty("retain", length3),
                new JProperty(
                    "attributes",
                    new JObject(
                        new JProperty("char", new JObject(new JProperty("cid", "456"), new JProperty("style", "wj")))
                    )
                )
            );

            Delta result = oldDel.Diff(newDel);
            Assert.That(result.Ops.Count, Is.EqualTo(3));
            Assert.That(JToken.DeepEquals(result.Ops[0], expectedObj1), Is.True);
            Assert.That(JToken.DeepEquals(result.Ops[1], expectedObj2), Is.True);
            Assert.That(JToken.DeepEquals(result.Ops[2], expectedObj3), Is.True);
        }

        [Test]
        public void GetLength_ReturnsOpLength()
        {
            var del = Delta.New();
            Assert.That(del.GetLength(), Is.EqualTo(0));
            del.Insert("A");
            Assert.That(del.GetLength(), Is.EqualTo(1));
        }

        [Test]
        public void DeepEquals_ExaminesEquality()
        {
            var a = Delta.New().Insert("A");
            var b = Delta.New().Insert("A").Insert("B");
            Assert.That(a.DeepEquals(b), Is.False);
            a.Insert("B", new { color = "red" });
            Assert.That(a.DeepEquals(b), Is.False);
            Delta c = b.Compose(Delta.New().Retain(1).Retain(1, new { color = "red" }));
            Assert.That(a.DeepEquals(c), Is.True);
        }

        [Test]
        public void ToString_ReturnsString()
        {
            var del = Delta.New().Insert("A").Insert("B", new { color = "red" });
            string str = del.ToString();
            Assert.That(str.Contains("\"insert\": \"A\""));
            Assert.That(str.Contains("\"insert\": \"B\""));
            Assert.That(str.Contains("\"color\": \"red\""));
        }

        private static IEnumerable<JObject> Objs(params object[] objs)
        {
            return objs.Select(Obj);
        }

        private static JObject Obj(object obj)
        {
            return JObject.FromObject(obj);
        }
    }
}
