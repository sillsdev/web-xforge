using NUnit.Framework;

namespace SIL.XForge.Scripture.Models
{
    [TestFixture]
    public class SyncMetricInfoTests
    {
        [Test]
        public void SyncMetricInfo_EmptyConstructor()
        {
            // SUT
            var syncMetricInfo = new SyncMetricInfo();

            Assert.That(syncMetricInfo.Added, Is.Zero);
            Assert.That(syncMetricInfo.Deleted, Is.Zero);
            Assert.That(syncMetricInfo.Updated, Is.Zero);
        }

        [Test]
        public void SyncMetricInfo_ConstructorParameterOrder()
        {
            // SUT
            var syncMetricInfo = new SyncMetricInfo(1, 2, 3);

            Assert.That(syncMetricInfo.Added, Is.EqualTo(1));
            Assert.That(syncMetricInfo.Deleted, Is.EqualTo(2));
            Assert.That(syncMetricInfo.Updated, Is.EqualTo(3));
        }

        [Test]
        public void SyncMetricInfo_AddOperatorFirstNull()
        {
            var syncMetricInfo = new SyncMetricInfo(1, 2, 3);

            // SUT
            var result = null + syncMetricInfo;

            Assert.That(result, Is.EqualTo(syncMetricInfo));
        }

        [Test]
        public void SyncMetricInfo_AddOperatorSecondNull()
        {
            var syncMetricInfo = new SyncMetricInfo(1, 2, 3);

            // SUT
            var result = syncMetricInfo + null;

            Assert.That(result, Is.EqualTo(syncMetricInfo));
        }

        [Test]
        public void SyncMetricInfo_AddOperatorBothValues()
        {
            var firstSyncMetricInfo = new SyncMetricInfo(1, 2, 3);
            var secondSyncMetricInfo = new SyncMetricInfo(5, 7, 11);
            var addedSyncMetricInfo = new SyncMetricInfo(6, 9, 14);

            // SUT
            var result = firstSyncMetricInfo + secondSyncMetricInfo;

            Assert.That(result, Is.EqualTo(addedSyncMetricInfo));
        }
    }
}
