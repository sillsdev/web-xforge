using System;
using System.Net;
using NSubstitute;
using NSubstitute.Extensions;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.Users;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class JwtInternetSharedRepositorySourceTests
{
    [Test]
    public void CanUserAuthenticateToPTArchives_Works()
    {
        var env = new TestEnvironment();
        env.MockPTArchivesClient
            .Configure()
            .Get(Arg.Any<string>())
            .Returns(
                _ =>
                    throw HttpException.Create(
                        new WebException(),
                        GenericRequest.Create(new Uri("https://example.com"))
                    )
            );
        // One SUT
        Assert.That(env.RepoSource.CanUserAuthenticateToPTArchives(), Is.False, "problem when using server");

        env.MockPTArchivesClient
            .Configure()
            .Get(Arg.Any<string>())
            .Returns(
                "<repos><repo><proj>ABCD</proj><projid>4011111111111111111111111111111111111111"
                    + "</projid><projecttype>BackTranslation</projecttype>"
                    + "<baseprojid>4022222222222222222222222222222222222222</baseprojid>"
                    + "<tipid>120000000000 tip</tipid><users><user>"
                    + "<name>Tony Translator</name><role>pt_administrator</role></user></users></repo></repos>"
            );
        // One SUT
        Assert.That(
            env.RepoSource.CanUserAuthenticateToPTArchives(),
            Is.True,
            "successful authentication and received data"
        );

        env.MockPTArchivesClient.Configure().Get(Arg.Any<string>()).Returns(string.Empty);
        // One SUT
        Assert.That(
            env.RepoSource.CanUserAuthenticateToPTArchives(),
            Is.True,
            "this would still be a successful authentication"
        );
    }

    private class TestEnvironment
    {
        public readonly JwtInternetSharedRepositorySource RepoSource;
        public readonly IRESTClient MockPTArchivesClient;

        public TestEnvironment()
        {
            ParatextUser ptUser = new SFParatextUser("pt-username");
            JwtRestClient mockPTRegistryClient = Substitute.For<JwtRestClient>(
                "https://baseUri.example.com",
                "applicationName",
                "jwtToken"
            );
            RepoSource = Substitute.ForPartsOf<JwtInternetSharedRepositorySource>(
                "access-token",
                mockPTRegistryClient,
                Substitute.For<IHgWrapper>(),
                ptUser,
                "sr-server-uri"
            );
            MockPTArchivesClient = Substitute.For<RESTClient>("pt-archives-server.example.com", "product-version-123");
            RepoSource.Configure().GetClient().Returns(MockPTArchivesClient);
        }
    }
}
