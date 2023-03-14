using System.Collections.Generic;
using System.Threading.Tasks;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class AnonymousServiceTests
{
    private const string Project01 = "project01";

    [Test]
    public void CheckSharingKey_CheckShareKeyValidityThrowsWhenReserved()
    {
        var env = new TestEnvironment();
        string shareKey = "key02";
        env.SFProjectService.GetProjectSecret(shareKey).Returns(env.ProjectSecrets.Get(Project01));
        env.SFProjectService.GetProjectAsync(Project01).Returns(Task.FromResult(env.Projects.Get(Project01)));
        env.SFProjectService.CheckShareKeyValidity(shareKey).Returns(Task.FromResult(true));

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() => env.Service.CheckSharingKey(shareKey));
    }

    [Test]
    public void CheckSharingKey_CheckShareKeyValidityThrowsWhenNotValid()
    {
        var env = new TestEnvironment();
        string shareKey = "key01";
        env.SFProjectService.GetProjectSecret(shareKey).Returns(env.ProjectSecrets.Get(Project01));
        env.SFProjectService.GetProjectAsync(Project01).Returns(Task.FromResult(env.Projects.Get(Project01)));
        env.SFProjectService.CheckShareKeyValidity(shareKey).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() => env.Service.CheckSharingKey(shareKey));
    }

    [Test]
    public async Task CheckSharingKey_GetProject()
    {
        var env = new TestEnvironment();
        string shareKey = "key01";
        env.SFProjectService.GetProjectSecret(shareKey).Returns(env.ProjectSecrets.Get(Project01));
        env.SFProjectService.GetProjectAsync(Project01).Returns(Task.FromResult(env.Projects.Get(Project01)));
        env.SFProjectService.CheckShareKeyValidity(shareKey).Returns(Task.FromResult(true));

        // SUT
        AnonymousShareKeyResponse? result = await env.Service.CheckSharingKey(shareKey);

        Assert.IsNotNull(result);
        Assert.AreEqual("Test Project 1", result.ProjectName);
        Assert.AreEqual(SFProjectRole.CommunityChecker, result.Role);
        Assert.AreEqual(shareKey, result.ShareKey);
    }

    [Test]
    public async Task CheckSharingKey_GenerateTransparentUser()
    {
        var env = new TestEnvironment();
        string shareKey = "key01";
        string displayName = "Test User";
        string language = "en";
        string username = "generatedKey";
        string password = "longerGeneratedKey";
        env.SFProjectService.GetProjectSecret(shareKey).Returns(env.ProjectSecrets.Get(Project01));
        env.SFProjectService.GetProjectAsync(Project01).Returns(Task.FromResult(env.Projects.Get(Project01)));
        env.SFProjectService.CheckShareKeyValidity(shareKey).Returns(Task.FromResult(true));
        env.SecurityService.GenerateKey().Returns(username);
        env.SecurityService.GenerateKey(16).Returns(password);

        // SUT
        TransparentAuthenticationCredentials? result = await env.Service.GenerateAccount(
            shareKey,
            displayName,
            language
        );

        Assert.IsNotNull(result);
        Assert.AreEqual(username, result.Username);
        Assert.AreEqual(password, result.Password);
    }

    [Test]
    public void CheckSharingKey_GenerateTransparentUserThrowsWhenKeyNotValid()
    {
        var env = new TestEnvironment();
        string shareKey = "key01";
        string displayName = "Test User";
        string language = "en";
        env.SFProjectService.GetProjectSecret(shareKey).Returns(env.ProjectSecrets.Get(Project01));
        env.SFProjectService.GetProjectAsync(Project01).Returns(Task.FromResult(env.Projects.Get(Project01)));
        env.SFProjectService.CheckShareKeyValidity(shareKey).Returns(Task.FromResult(false));

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() => env.Service.GenerateAccount(shareKey, displayName, language));
    }

    private class TestEnvironment
    {
        public readonly IAuthService AuthService = Substitute.For<IAuthService>();
        public MemoryRepository<SFProject> Projects { get; }
        public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
        public ISFProjectService SFProjectService { get; }
        public readonly ISecurityService SecurityService = Substitute.For<ISecurityService>();
        public AnonymousService Service { get; }

        public TestEnvironment()
        {
            SFProjectService = Substitute.For<ISFProjectService>();
            Service = new AnonymousService(AuthService, SFProjectService, SecurityService);

            Projects = new MemoryRepository<SFProject>(
                new[]
                {
                    new SFProject { Id = Project01, Name = "Test Project 1" }
                }
            );

            ProjectSecrets = new MemoryRepository<SFProjectSecret>(
                new[]
                {
                    new SFProjectSecret
                    {
                        Id = Project01,
                        ShareKeys = new List<ShareKey>
                        {
                            new ShareKey
                            {
                                Key = "key01",
                                ProjectRole = SFProjectRole.CommunityChecker,
                                ShareLinkType = ShareLinkType.Recipient
                            },
                            new ShareKey
                            {
                                Key = "key02",
                                RecipientUserId = "user01",
                                ProjectRole = SFProjectRole.CommunityChecker,
                                ShareLinkType = ShareLinkType.Recipient
                            }
                        }
                    }
                }
            );
        }
    }
}
