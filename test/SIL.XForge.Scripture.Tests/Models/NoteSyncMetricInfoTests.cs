using NUnit.Framework;

namespace SIL.XForge.Scripture.Models;

[TestFixture]
public class NoteNoteSyncMetricInfoTests
{
    [Test]
    public void NoteSyncMetricInfo_EmptyConstructor()
    {
        // SUT
        var noteSyncMetricInfo = new NoteSyncMetricInfo();

        Assert.That(noteSyncMetricInfo.Added, Is.Zero);
        Assert.That(noteSyncMetricInfo.Deleted, Is.Zero);
        Assert.That(noteSyncMetricInfo.Updated, Is.Zero);
        Assert.That(noteSyncMetricInfo.Removed, Is.Zero);
    }

    [Test]
    public void NoteSyncMetricInfo_ConstructorParameterOrder()
    {
        // SUT
        var noteSyncMetricInfo = new NoteSyncMetricInfo(1, 2, 3, 4);

        Assert.That(noteSyncMetricInfo.Added, Is.EqualTo(1));
        Assert.That(noteSyncMetricInfo.Deleted, Is.EqualTo(2));
        Assert.That(noteSyncMetricInfo.Updated, Is.EqualTo(3));
        Assert.That(noteSyncMetricInfo.Removed, Is.EqualTo(4));
    }

    [Test]
    public void NoteSyncMetricInfo_AddOperatorFirstNull()
    {
        var noteSyncMetricInfo = new NoteSyncMetricInfo(1, 2, 3, 4);

        // SUT
        var result = null + noteSyncMetricInfo;

        Assert.That(result, Is.EqualTo(noteSyncMetricInfo));
    }

    [Test]
    public void NoteSyncMetricInfo_AddOperatorSecondNull()
    {
        var noteSyncMetricInfo = new NoteSyncMetricInfo(1, 2, 3, 4);

        // SUT
        var result = noteSyncMetricInfo + null;

        Assert.That(result, Is.EqualTo(noteSyncMetricInfo));
    }

    [Test]
    public void NoteSyncMetricInfo_AddOperatorBothValues()
    {
        var firstNoteSyncMetricInfo = new NoteSyncMetricInfo(1, 2, 3, 5);
        var secondNoteSyncMetricInfo = new NoteSyncMetricInfo(7, 11, 13, 17);
        var addedNoteSyncMetricInfo = new NoteSyncMetricInfo(8, 13, 16, 22);

        // SUT
        var result = firstNoteSyncMetricInfo + secondNoteSyncMetricInfo;

        Assert.That(result, Is.EqualTo(addedNoteSyncMetricInfo));
    }
}
