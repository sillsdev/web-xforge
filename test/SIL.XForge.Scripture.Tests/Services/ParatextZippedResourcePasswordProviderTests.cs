using NUnit.Framework;
using Paratext.Data.ProjectFileAccess;
using PtxUtils;
using SIL.XForge.Configuration;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class ParatextZippedResourcePasswordProviderTests
{
    [Test]
    public void GetPassword_ParatextOptionsNull()
    {
        var env = new TestEnvironment(paratextOptions: null);
        string expected = string.Empty;
        string actual = env.Service.GetPassword();
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void GetPassword_MissingResourcePasswordBase64()
    {
        var paratextOptions = new ParatextOptions { ResourcePasswordHash = "test" };
        var env = new TestEnvironment(paratextOptions);
        string expected = string.Empty;
        string actual = env.Service.GetPassword();
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void GetPassword_MissingResourcePasswordHash()
    {
        var paratextOptions = new ParatextOptions { ResourcePasswordBase64 = "test" };
        var env = new TestEnvironment(paratextOptions);
        string expected = string.Empty;
        string actual = env.Service.GetPassword();
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void GetPassword_Success()
    {
        const string expected = "String to encode";
        const string resourcePasswordHash = "secret password hash";
        string resourcePasswordBase64 = StringUtils.EncryptStringToBase64(expected, resourcePasswordHash);
        var paratextOptions = new ParatextOptions
        {
            ResourcePasswordBase64 = resourcePasswordBase64,
            ResourcePasswordHash = resourcePasswordHash,
        };
        var env = new TestEnvironment(paratextOptions);
        string actual = env.Service.GetPassword();
        Assert.AreEqual(expected, actual);
    }

    private class TestEnvironment(ParatextOptions? paratextOptions)
    {
        public readonly IZippedResourcePasswordProvider Service = new ParatextZippedResourcePasswordProvider(
            paratextOptions
        );
    }
}
