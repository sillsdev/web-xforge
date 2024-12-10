using System.Collections.Generic;
using NUnit.Framework;

namespace SIL.XForge.Utils;

[TestFixture]
public class DictionaryComparerTests
{
    [Test]
    public void Equals_IsFalse()
    {
        var x = new Dictionary<string, string> { { "one", "value_one" }, { "two", "value_two" } };
        var y = new Dictionary<string, string> { { "one", "value_three" }, { "two", "value_two" } };

        // SUT
        var comparer = new DictionaryComparer<string, string>();

        Assert.IsFalse(comparer.Equals(x, y));
    }

    [Test]
    public void Equals_IsTrue()
    {
        var x = new Dictionary<string, string> { { "one", "value_one" }, { "two", "value_two" } };
        var y = new Dictionary<string, string> { { "one", "value_one" }, { "two", "value_two" } };

        // SUT
        var comparer = new DictionaryComparer<string, string>();

        Assert.IsTrue(comparer.Equals(x, y));
    }

    [Test]
    public void Equals_NullIsTrue()
    {
        // SUT
        var comparer = new DictionaryComparer<string, string>();

        Assert.IsTrue(comparer.Equals(null, null));
    }

    [Test]
    public void GetHashCode_IsEqual()
    {
        var x = new Dictionary<string, string> { { "one", "value_one" }, { "two", "value_two" } };
        var y = new Dictionary<string, string> { { "two", "value_two" }, { "one", "value_one" } };

        // SUT
        var comparer = new DictionaryComparer<string, string>();

        Assert.AreEqual(comparer.GetHashCode(x), comparer.GetHashCode(y));
    }

    [Test]
    public void GetHashCode_IsNotEqual()
    {
        var x = new Dictionary<string, string> { { "one", "value_one" }, { "two", "value_two" } };
        var y = new Dictionary<string, string> { { "one", "value_three" }, { "two", "value_two" } };

        // SUT
        var comparer = new DictionaryComparer<string, string>();

        Assert.AreNotEqual(comparer.GetHashCode(x), comparer.GetHashCode(y));
    }

    [Test]
    public void GetHashCode_NullIsEqual()
    {
        // SUT
        var comparer = new DictionaryComparer<string, string>();

        Assert.AreEqual(comparer.GetHashCode(null), comparer.GetHashCode(null));
    }
}
