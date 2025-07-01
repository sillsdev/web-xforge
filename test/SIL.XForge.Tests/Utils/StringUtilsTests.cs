using NUnit.Framework;

namespace SIL.XForge.Utils;

[TestFixture]
public class StringUtilsTests
{
    [TestCase("おはようございます", "e12eb2fcd53563b7e4487594633349af")]
    [TestCase("Good morning", "4e44298897ed12cdc10e5302fa781688")]
    public void ComputeMd5Hash(string message, string expected) =>
        Assert.That(StringUtils.ComputeMd5Hash(message), Is.EqualTo(expected));
}
