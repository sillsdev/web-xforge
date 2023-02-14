using NUnit.Framework;

namespace SIL.XForge.Services;

[TestFixture]
public class SecurityServiceTests
{
    [Test]
    public void GenerateKey_GeneratesDifferentKeys()
    {
        var security = new SecurityService();
        var first = security.GenerateKey();
        var second = security.GenerateKey();
        Assert.That(first, Is.Not.EqualTo(0), "unlikely");
        Assert.That(first, Is.Not.EqualTo(second), "unlikely");
        Assert.That(first.Length, Is.EqualTo(16), "unexpected length");
    }
}
