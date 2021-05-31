using System.Collections.Generic;
using NUnit.Framework;
using SIL.XForge.Models;

namespace SIL.XForge.DataAccess
{
    [TestFixture]
    public class MemoryUpdateBuilderTests
    {
        [Test]
        public void MemoryUpdateBuilder_Add()
        {
            // Setup environment
            var env = new TestEnvironment();
            int oldCount = env.TestEntity.TestChildCollection.Count;

            // Test collection add
            env.MemoryUpdateBuilder.Add(e => e.TestChildCollection, new TestEntity { Id = "test_id_3" });
            Assert.AreEqual(oldCount + 1, env.TestEntity.TestChildCollection.Count);
        }

        [Test]
        public void MemoryUpdateBuilder_Inc()
        {
            var env = new TestEnvironment();
            int oldValue = env.TestEntity.TestChildCollection.Count;

            // Test increment
            env.MemoryUpdateBuilder.Inc(e => e.TestNumber, 1);
            Assert.AreEqual(oldValue + 1, env.TestEntity.TestNumber);

            // Test decrement
            env.MemoryUpdateBuilder.Inc(e => e.TestNumber, -1);
            Assert.AreEqual(oldValue, env.TestEntity.TestNumber);
        }

        [Test]
        public void MemoryUpdateBuilder_Remove()
        {
            // Setup environment
            var env = new TestEnvironment();
            int oldCount = env.TestEntity.TestStringCollection.Count;

            // Test string collection remove
            env.MemoryUpdateBuilder.Remove(e => e.TestStringCollection, "test_value_2");
            Assert.AreEqual(oldCount - 1, env.TestEntity.TestStringCollection.Count);
        }

        [Test]
        public void MemoryUpdateBuilder_RemoveAll()
        {
            // Setup environment
            var env = new TestEnvironment();
            int oldCount = env.TestEntity.TestChildCollection.Count;

            // Test string collection remove all
            env.MemoryUpdateBuilder.RemoveAll(e => e.TestChildCollection, e => e.Id == "test_id_2");
            Assert.AreEqual(oldCount - 1, env.TestEntity.TestChildCollection.Count);
        }

        [Test]
        public void MemoryUpdateBuilder_Set()
        {
            // Setup environment
            var env = new TestEnvironment();
            string oldValue = env.TestEntity.TestStringField;
            string expected = "updated_test_value";

            // Test string field set
            Assert.AreNotEqual(expected, env.TestEntity.TestStringField);
            env.MemoryUpdateBuilder.Set(e => e.TestStringField, expected);
            Assert.AreEqual(expected, env.TestEntity.TestStringField);
        }

        [Test]
        public void MemoryUpdateBuilder_SetOnInsertDisabled()
        {
            // Setup environment
            var env = new TestEnvironment(false);
            string oldValue = env.TestEntity.TestStringField;
            string expected = "updated_test_value";

            // Test string field set
            Assert.AreNotEqual(expected, env.TestEntity.TestStringField);
            env.MemoryUpdateBuilder.SetOnInsert(e => e.TestStringField, expected);
            Assert.AreEqual(oldValue, env.TestEntity.TestStringField);
        }

        [Test]
        public void MemoryUpdateBuilder_SetOnInsertEnabled()
        {
            // Setup environment
            var env = new TestEnvironment(true);
            string oldValue = env.TestEntity.TestStringField;
            string expected = "updated_test_value";

            // Test string field set
            Assert.AreNotEqual(expected, env.TestEntity.TestStringField);
            env.MemoryUpdateBuilder.SetOnInsert(e => e.TestStringField, expected);
            Assert.AreEqual(expected, env.TestEntity.TestStringField);
        }

        [Test]
        public void MemoryUpdateBuilder_Unset()
        {
            // Setup environment
            var env = new TestEnvironment();
            string expected = null;

            // Test string field unset
            Assert.AreNotEqual(expected, env.TestEntity.TestStringField);
            env.MemoryUpdateBuilder.Unset(e => e.TestStringField);
            Assert.AreEqual(expected, env.TestEntity.TestStringField);
        }

        private class TestEntity : IIdentifiable
        {
            public string Id { get; set; }
            public int TestNumber { get; set; }
            public List<TestEntity> TestChildCollection { get; set; } = new List<TestEntity>();
            public List<string> TestStringCollection { get; set; } = new List<string>();
            public string TestStringField { get; set; }
        }

        private class TestEnvironment
        {
            public TestEnvironment(bool setOnInsert = false)
            {
                // Set up the test entity
                TestEntity = new TestEntity
                {
                    Id = "test_id_1",
                    TestChildCollection = new List<TestEntity>
                    {
                        new TestEntity { Id = "test_id_2" },
                    },
                    TestNumber = 1,
                    TestStringCollection = new List<string>
                    {
                        "test_value_1",
                        "test_value_2",
                    },
                    TestStringField = "test_value",
                };

                // Set up the memory update builder for the test entity
                MemoryUpdateBuilder =
                    new MemoryUpdateBuilder<TestEntity>(e => e.Id == TestEntity.Id, TestEntity, setOnInsert);
            }
            public MemoryUpdateBuilder<TestEntity> MemoryUpdateBuilder { get; }
            public TestEntity TestEntity { get; }
        }
    }
}
