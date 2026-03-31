using System;
using System.Net;
using NSubstitute;
using NSubstitute.Extensions;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class JwtInternetSharedRepositorySourceTests
{
    private const string ProjectName = "TestProject";
    private const string ProjectId = "4011111111111111111111111111111111111111";
    private const string NewTipRevision = "bbb2222222222222222222222222222222222222";
    private const string BaseTipRevision = "aaa1111111111111111111111111111111111111";

    [Test]
    public void CanUserAuthenticateToPTArchives_Works()
    {
        var env = new TestEnvironment();
        env.MockPTArchivesClient.Configure()
            .Get(Arg.Any<string>())
            .Returns(_ =>
                throw HttpException.Create(new WebException(), GenericRequest.Create(new Uri("https://example.com")))
            );
        // One SUT
        Assert.That(env.RepoSource.CanUserAuthenticateToPTArchives(), Is.False, "problem when using server");

        env.MockPTArchivesClient.Configure()
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

    [Test]
    public void CheckPushRevisionOnServer_RevisionExists_ReturnsFound()
    {
        var env = new TestEnvironment();
        SharedRepository pushRepo = CreatePushRepo();
        env.SetProjRevHistResponse(revisionIds: [BaseTipRevision, NewTipRevision]);

        // SUT
        (bool isRevOnServer, int serverRevCount, string serverLastRev) = env.RepoSource.CheckPushRevisionOnServer(
            pushRepo,
            NewTipRevision
        );

        Assert.That(isRevOnServer, Is.True);
        Assert.That(serverRevCount, Is.EqualTo(2));
        Assert.That(serverLastRev, Is.EqualTo(BaseTipRevision));
    }

    [Test]
    public void CheckPushRevisionOnServer_RevisionMissing_ReturnsNotFound()
    {
        var env = new TestEnvironment();
        SharedRepository pushRepo = CreatePushRepo();
        // Server only has the base revision, not the new one
        env.SetProjRevHistResponse(revisionIds: [BaseTipRevision]);

        // SUT
        (bool isRevOnServer, int serverRevCount, string serverLastRev) = env.RepoSource.CheckPushRevisionOnServer(
            pushRepo,
            NewTipRevision
        );

        Assert.That(isRevOnServer, Is.False);
        Assert.That(serverRevCount, Is.EqualTo(1));
        Assert.That(serverLastRev, Is.EqualTo(BaseTipRevision));
    }

    [Test]
    public void CheckPushRevisionOnServer_EmptyServerResponse_ReturnsNotFound()
    {
        var env = new TestEnvironment();
        SharedRepository pushRepo = CreatePushRepo();
        // Server returns an empty revision list
        env.SetProjRevHistResponse(revisionIds: []);

        // SUT
        (bool isRevOnServer, int serverRevCount, string serverLastRev) = env.RepoSource.CheckPushRevisionOnServer(
            pushRepo,
            NewTipRevision
        );

        Assert.That(isRevOnServer, Is.False);
        Assert.That(serverRevCount, Is.EqualTo(0));
        Assert.That(serverLastRev, Is.EqualTo("(none)"));
    }

    private static SharedRepository CreatePushRepo() =>
        new SharedRepository { SendReceiveId = HexId.FromStr(ProjectId), ScrTextName = ProjectName };

    /// <summary>
    /// Test environment for JwtInternetSharedRepositorySource tests.
    /// </summary>
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
                "sr-server-uri",
                new MockLogger<InternetSharedRepositorySourceProvider>()
            );
            MockPTArchivesClient = Substitute.For<RESTClient>("pt-archives-server.example.com", "product-version-123");
            RepoSource.Configure().GetClient().Returns(MockPTArchivesClient);
        }

        /// <summary>
        /// Sets up the projrevhist API response to return the given revision IDs.
        /// </summary>
        public void SetProjRevHistResponse(string[] revisionIds)
        {
            string revisionsJson = string.Join(
                ",",
                Array.ConvertAll(revisionIds, id => $"{{\"id\":\"{id}\",\"parents\":[]}}")
            );
            string json = $"{{\"project\":{{\"revision_history\":{{\"revisions\":[{revisionsJson}]}}}}}}";
            MockPTArchivesClient.Configure().Get(Arg.Any<string>(), Arg.Any<string[]>()).Returns(json);
        }
    }
}
