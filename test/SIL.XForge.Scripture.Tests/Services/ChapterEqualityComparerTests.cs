using NUnit.Framework;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class ChapterEqualityComparerTests
{
    [Test]
    public void Equals_IsFalse()
    {
        var x = new Chapter
        {
            Number = 1,
            LastVerse = 2,
            IsValid = true,
        };
        var y = new Chapter
        {
            Number = 2,
            LastVerse = 1,
            IsValid = true,
        };

        // SUT
        var comparer = new ChapterEqualityComparer();

        Assert.IsFalse(comparer.Equals(x, y));
    }

    [Test]
    public void Equals_IsTrue()
    {
        var x = new Chapter
        {
            Number = 1,
            LastVerse = 2,
            IsValid = true,
        };
        var y = new Chapter
        {
            Number = 1,
            LastVerse = 2,
            IsValid = true,
        };

        // SUT
        var comparer = new ChapterEqualityComparer();

        Assert.IsTrue(comparer.Equals(x, y));
    }

    [Test]
    public void Equals_NullIsTrue()
    {
        // SUT
        var comparer = new ChapterEqualityComparer();

        Assert.IsTrue(comparer.Equals(null, null));
    }

    [Test]
    public void GetHashCode_IsEqual()
    {
        var x = new Chapter
        {
            Number = 1,
            LastVerse = 2,
            IsValid = true,
        };
        var y = new Chapter
        {
            Number = 1,
            LastVerse = 2,
            IsValid = true,
        };

        // SUT
        var comparer = new ChapterEqualityComparer();

        Assert.AreEqual(comparer.GetHashCode(x), comparer.GetHashCode(y));
    }

    [Test]
    public void GetHashCode_IsNotEqual()
    {
        var x = new Chapter
        {
            Number = 1,
            LastVerse = 2,
            IsValid = true,
        };
        var y = new Chapter
        {
            Number = 2,
            LastVerse = 1,
            IsValid = true,
        };

        // SUT
        var comparer = new ChapterEqualityComparer();

        Assert.AreNotEqual(comparer.GetHashCode(x), comparer.GetHashCode(y));
    }

    [Test]
    public void GetHashCode_NullIsEqual()
    {
        // SUT
        var comparer = new ChapterEqualityComparer();

        Assert.AreEqual(comparer.GetHashCode(null), comparer.GetHashCode(null));
    }
}
