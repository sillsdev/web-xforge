using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class AnonymousServiceTests
{
    private const int MaxUsers = 250;
    private const string Project01 = "project01";

    [Test]
    public void CheckSharingKey_CheckShareKeyValidityThrowsWhenReserved()
    {
        var env = new TestEnvironment();
        string shareKey = "key02";
        SFProject project = env.Projects.Get(Project01);
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);
        ShareKey projectSecretShareKey = projectSecret.ShareKeys.FirstOrDefault(sk => sk.Key == shareKey);
        env.SFProjectService.GetProjectSecretByShareKey(shareKey).Returns(projectSecret);
        env.SFProjectService.GetProjectAsync(Project01).Returns(Task.FromResult(project));
        env.SFProjectService.CheckShareKeyValidity(shareKey)
            .Returns(
                Task.FromResult(
                    new ValidShareKey()
                    {
                        Project = project,
                        ProjectSecret = projectSecret,
                        ShareKey = projectSecretShareKey,
                    }
                )
            );

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.CheckShareKey(shareKey));
    }

    [Test]
    public void CheckSharingKey_CheckShareKeyValidityThrowsWhenNotValid()
    {
        var env = new TestEnvironment();
        string shareKey = "key01";
        env.SFProjectService.GetProjectSecretByShareKey(shareKey).Returns(env.ProjectSecrets.Get(Project01));
        env.SFProjectService.GetProjectAsync(Project01).Returns(Task.FromResult(env.Projects.Get(Project01)));
        env.SFProjectService.CheckShareKeyValidity(shareKey).Throws(new ForbiddenException());

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() => env.Service.CheckShareKey(shareKey));
    }

    [Test]
    public async Task CheckSharingKey_GetProject()
    {
        var env = new TestEnvironment();
        string shareKey = "key01";
        SFProject project = env.Projects.Get(Project01);
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);
        ShareKey projectSecretShareKey = projectSecret.ShareKeys.FirstOrDefault(sk => sk.Key == shareKey);
        env.SFProjectService.GetProjectSecretByShareKey(shareKey).Returns(projectSecret);
        env.SFProjectService.GetProjectAsync(Project01).Returns(Task.FromResult(project));
        env.SFProjectService.CheckShareKeyValidity(shareKey)
            .Returns(
                Task.FromResult(
                    new ValidShareKey()
                    {
                        Project = project,
                        ProjectSecret = projectSecret,
                        ShareKey = projectSecretShareKey,
                    }
                )
            );

        // SUT
        AnonymousShareKeyResponse? result = await env.Service.CheckShareKey(shareKey);

        Assert.IsNotNull(result);
        Assert.AreEqual("Test Project 1", result.ProjectName);
        Assert.AreEqual(SFProjectRole.CommunityChecker, result.Role);
        Assert.AreEqual(shareKey, result.ShareKey);
    }

    [Test]
    public async Task CheckSharingKey_GenerateAnonymousUser()
    {
        var env = new TestEnvironment();
        string shareKey = "key01";
        string displayName = "Test User";
        string language = "en";
        string username = "generatedKey";
        string password = "longerGeneratedKey";
        env.SFProjectService.CheckShareKeyValidity(shareKey).Returns(Task.FromResult(new ValidShareKey()));
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
        await env.SFProjectService.Received(1).IncreaseShareKeyUsersGenerated(shareKey);
    }

    [Test]
    public void CheckSharingKey_GenerateAnonymousUserThrowsWhenKeyNotValid()
    {
        var env = new TestEnvironment();
        string shareKey = "key01";
        string displayName = "Test User";
        string language = "en";
        env.SFProjectService.GetProjectSecretByShareKey(shareKey).Returns(env.ProjectSecrets.Get(Project01));
        env.SFProjectService.GetProjectAsync(Project01).Returns(Task.FromResult(env.Projects.Get(Project01)));
        env.SFProjectService.CheckShareKeyValidity(shareKey).Throws(new ForbiddenException());

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() => env.Service.GenerateAccount(shareKey, displayName, language));
    }

    [Test]
    public void CheckSharingKey_GenerateAnonymousUserThrowsWhenMaxUsersGeneratedReached()
    {
        var env = new TestEnvironment();
        string shareKey = "key03";
        string displayName = "Test User";
        string language = "en";
        SFProject project = env.Projects.Get(Project01);
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);
        ShareKey projectSecretShareKey = projectSecret.ShareKeys.FirstOrDefault(sk => sk.Key == shareKey);
        env.SFProjectService.GetProjectSecretByShareKey(shareKey).Returns(env.ProjectSecrets.Get(Project01));
        env.SFProjectService.GetProjectAsync(Project01).Returns(Task.FromResult(env.Projects.Get(Project01)));
        env.SFProjectService.CheckShareKeyValidity(shareKey)
            .Returns(
                Task.FromResult(
                    new ValidShareKey()
                    {
                        Project = project,
                        ProjectSecret = projectSecret,
                        ShareKey = projectSecretShareKey,
                    }
                )
            );

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.GenerateAccount(shareKey, displayName, language));
        Assert.AreEqual(project.MaxGeneratedUsersPerShareKey, MaxUsers);
        Assert.AreEqual(projectSecretShareKey.UsersGenerated, MaxUsers);
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
                    new SFProject { Id = Project01, Name = "Test Project 1" },
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
                                ShareLinkType = ShareLinkType.Recipient,
                            },
                            new ShareKey
                            {
                                Key = "key02",
                                RecipientUserId = "user01",
                                ProjectRole = SFProjectRole.CommunityChecker,
                                ShareLinkType = ShareLinkType.Recipient,
                            },
                            new ShareKey
                            {
                                Key = "key03",
                                RecipientUserId = "user01",
                                ProjectRole = SFProjectRole.CommunityChecker,
                                ShareLinkType = ShareLinkType.Recipient,
                                UsersGenerated = MaxUsers,
                            },
                        },
                    },
                }
            );
        }
    }
}
