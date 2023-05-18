using NUnit.Framework;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class NoteTagEqualityComparerTests
{
    [Test]
    public void Equals_IsFalse()
    {
        var x = new NoteTag
        {
            TagId = 0,
            Icon = "icon",
            Name = "name",
            CreatorResolve = true,
        };
        var y = new NoteTag
        {
            TagId = 1,
            Icon = "icon",
            Name = "name",
            CreatorResolve = true,
        };

        // SUT
        var comparer = new NoteTagEqualityComparer();

        Assert.IsFalse(comparer.Equals(x, y));
    }

    [Test]
    public void Equals_IsTrue()
    {
        var x = new NoteTag
        {
            TagId = 0,
            Icon = "icon",
            Name = "name",
            CreatorResolve = true,
        };
        var y = new NoteTag
        {
            TagId = 0,
            Icon = "icon",
            Name = "name",
            CreatorResolve = true,
        };
        // SUT
        var comparer = new NoteTagEqualityComparer();

        Assert.IsTrue(comparer.Equals(x, y));
    }

    [Test]
    public void Equals_NullIsTrue()
    {
        // SUT
        var comparer = new NoteTagEqualityComparer();

        Assert.IsTrue(comparer.Equals(null, null));
    }

    [Test]
    public void GetHashCode_IsEqual()
    {
        var x = new NoteTag
        {
            TagId = 0,
            Icon = "icon",
            Name = "name",
            CreatorResolve = true,
        };
        var y = new NoteTag
        {
            TagId = 0,
            Icon = "icon",
            Name = "name",
            CreatorResolve = true,
        };

        // SUT
        var comparer = new NoteTagEqualityComparer();

        Assert.AreEqual(comparer.GetHashCode(x), comparer.GetHashCode(y));
    }

    [Test]
    public void GetHashCode_IsNotEqual()
    {
        var x = new NoteTag
        {
            TagId = 0,
            Icon = "icon",
            Name = "name",
            CreatorResolve = true,
        };
        var y = new NoteTag
        {
            TagId = 1,
            Icon = "icon",
            Name = "name",
            CreatorResolve = true,
        };

        // SUT
        var comparer = new NoteTagEqualityComparer();

        Assert.AreNotEqual(comparer.GetHashCode(x), comparer.GetHashCode(y));
    }

    [Test]
    public void GetHashCode_NullIsEqual()
    {
        // SUT
        var comparer = new NoteTagEqualityComparer();

        Assert.AreEqual(comparer.GetHashCode(null), comparer.GetHashCode(null));
    }
}
