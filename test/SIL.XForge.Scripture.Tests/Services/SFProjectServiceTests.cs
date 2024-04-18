using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Hangfire;
using Hangfire.Common;
using Hangfire.States;
using Microsoft.Extensions.Localization;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using SIL.XForge.Services;
using SIL.XForge.Utils;
using Options = Microsoft.Extensions.Options.Options;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class SFProjectServiceTests
{
    private const string Project01 = "project01";
    private const string Project02 = "project02";
    private const string Project03 = "project03";
    private const string Project04 = "project04";
    private const string Project05 = "project05";
    private const string Project06 = "project06";
    private const string Resource01 = "resource_project";
    private const string SourceOnly = "source_only";
    private const string Resource01PTId = "resid_is_16_char";
    private const string User01 = "user01";
    private const string User02 = "user02";
    private const string User03 = "user03";
    private const string User04 = "user04";
    private const string User05 = "user05";
    private const string User06 = "user06";
    private const string User07 = "user07";
    private const string LinkExpiredUser = "linkexpireduser";
    private const string SiteId = "xf";
    private const string PTProjectIdNotYetInSF = "paratext_notYetInSF";

    [Test]
    public async Task InviteAsync_ProjectAdminSharingDisabled_UserInvited()
    {
        var env = new TestEnvironment();
        const string email = "newuser@example.com";
        const string role = SFProjectRole.CommunityChecker;

        await env.Service.InviteAsync(User01, Project01, email, "en", role);
        await env.EmailService.Received(1)
            .SendEmailAsync(
                email,
                Arg.Any<string>(),
                Arg.Is<string>(
                    body =>
                        body.Contains($"http://localhost/projects/{Project01}?sharing=true&shareKey=1234abc")
                        && body.Contains("The project invitation link expires in 14 days")
                )
            );
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);
        Assert.That(projectSecret.ShareKeys.Single(sk => sk.Email == email).ProjectRole, Is.EqualTo(role));
    }

    [Test]
    public async Task InviteAsync_SpecificSharingEnabled_UserInvited()
    {
        var env = new TestEnvironment();
        const string email = "newuser@example.com";
        const string role = SFProjectRole.CommunityChecker;

        await env.Service.InviteAsync(User01, Project03, email, "en", role);
        await env.EmailService.Received(1)
            .SendEmailAsync(
                email,
                Arg.Any<string>(),
                Arg.Is<string>(
                    body =>
                        body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=1234abc")
                        && body.Contains("The project invitation link expires in 14 days")
                )
            );

        // Code was recorded in database and email address was encoded in ShareKeys
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
        Assert.That(projectSecret.ShareKeys.Single(sk => sk.Email == email).Key, Is.EqualTo("1234abc"));
        Assert.That(projectSecret.ShareKeys.Single(sk => sk.Email == email).ProjectRole, Is.EqualTo(role));
    }

    [Test]
    public async Task InviteAsync_SpecificSharingEnabled_InvitedWithTranslateRoles()
    {
        var env = new TestEnvironment();
        const string observerEmail = "sf_observer@example.com";
        const string observerKey = "sfobserverkey";
        env.SecurityService.GenerateKey().Returns(observerKey);
        await env.Service.InviteAsync(User02, Project04, observerEmail, "en", SFProjectRole.Viewer);
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project04);
        Assert.That(
            projectSecret.ShareKeys.Any(
                s => s.Email == observerEmail && s.Key == observerKey && s.ProjectRole == SFProjectRole.Viewer
            ),
            Is.True
        );
        await env.EmailService.Received(1)
            .SendEmailAsync(
                observerEmail,
                Arg.Any<string>(),
                Arg.Is<string>(
                    body => body.Contains($"http://localhost/projects/{Project04}?sharing=true&shareKey={observerKey}")
                )
            );

        const string reviewerEmail = "reviewer@example.com";
        const string reviewerKey = "reviewerKey";
        env.SecurityService.GenerateKey().Returns(reviewerKey);
        await env.Service.InviteAsync(User02, Project04, reviewerEmail, "en", SFProjectRole.Commenter);
        projectSecret = env.ProjectSecrets.Get(Project04);
        Assert.That(
            projectSecret.ShareKeys.Any(
                s => s.Email == reviewerEmail && s.Key == reviewerKey && s.ProjectRole == SFProjectRole.Commenter
            ),
            Is.True
        );
        await env.EmailService.Received(1)
            .SendEmailAsync(
                reviewerEmail,
                Arg.Any<string>(),
                Arg.Is<string>(
                    body => body.Contains($"http://localhost/projects/{Project04}?sharing=true&shareKey={reviewerKey}")
                )
            );
    }

    [Test]
    public async Task InviteAsync_SpecificSharingEnabled_UserInvitedTwiceButWithSameCode()
    {
        var env = new TestEnvironment();
        const string email = "bob@example.com";
        const string initialRole = SFProjectRole.CommunityChecker;
        const string endingRole = SFProjectRole.Viewer;

        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
        Assert.That(
            projectSecret.ShareKeys.Single(sk => sk.Email == email).ExpirationTime,
            Is.LessThan(DateTime.UtcNow.AddDays(2)),
            "setup"
        );
        var invitees = await env.Service.InvitedUsersAsync(User01, Project03);
        Assert.That(
            invitees.Select(i => i.Email),
            Is.EquivalentTo(
                new[] { "bob@example.com", "expired@example.com", "user03@example.com", "bill@example.com" }
            ),
            "setup"
        );
        Assert.That(invitees[0].Role == initialRole);

        await env.Service.InviteAsync(User01, Project03, email, "en", endingRole);
        // Invitation email was resent but with original code and updated time
        await env.EmailService.Received(1)
            .SendEmailAsync(
                Arg.Is(email),
                Arg.Any<string>(),
                Arg.Is<string>(
                    body => body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=key1111")
                )
            );

        projectSecret = env.ProjectSecrets.Get(Project03);
        Assert.That(
            projectSecret.ShareKeys.Single(sk => sk.Email == email).Key,
            Is.EqualTo("key1111"),
            "Code should not have been changed"
        );
        Assert.That(
            projectSecret.ShareKeys.Single(sk => sk.Email == email).ExpirationTime,
            Is.GreaterThan(DateTime.UtcNow.AddDays(13))
        );
        Assert.That(projectSecret.ShareKeys.Single(sk => sk.Email == email).ProjectRole, Is.EqualTo(endingRole));

        invitees = await env.Service.InvitedUsersAsync(User01, Project03);
        Assert.That(
            invitees.Select(i => i.Email),
            Is.EquivalentTo(
                new[] { "bob@example.com", "expired@example.com", "user03@example.com", "bill@example.com" }
            )
        );
    }

    [Test]
    public async Task InviteAsync_SpecificSharingEnabledCodeExpired_UserInvitedWithNewCode()
    {
        var env = new TestEnvironment();
        const string email = "expired@example.com";
        const string role = SFProjectRole.CommunityChecker;

        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
        Assert.That(
            projectSecret.ShareKeys.Any(sk => sk.Email == email && sk.ExpirationTime < DateTime.UtcNow),
            Is.True,
            "setup"
        );

        env.SecurityService.GenerateKey().Returns("newkey");
        await env.Service.InviteAsync(User01, Project03, email, "en", role);
        // Invitation email was sent with a new code
        await env.EmailService.Received(1)
            .SendEmailAsync(
                Arg.Is(email),
                Arg.Any<string>(),
                Arg.Is<string>(
                    body => body.Contains($"http://localhost/projects/{Project03}?sharing=true&shareKey=newkey")
                )
            );

        projectSecret = env.ProjectSecrets.Get(Project03);
        Assert.That(
            projectSecret.ShareKeys.Single(sk => sk.Email == email).Key,
            Is.EqualTo("newkey"),
            "Code should not have been changed"
        );
        Assert.That(projectSecret.ShareKeys.Single(sk => sk.Email == email).ProjectRole, Is.EqualTo(role));
    }

    [Test]
    public async Task InviteAsync_LinkSharingEnabled_UserInvited()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project02);
        Assert.That(project.CheckingConfig.ShareEnabled, Is.True, "setup");
        const string email = "newuser@example.com";
        const string role = SFProjectRole.CommunityChecker;
        // SUT
        await env.Service.InviteAsync(User02, Project02, email, "en", role);
        await env.EmailService.Received(1)
            .SendEmailAsync(
                email,
                Arg.Any<string>(),
                Arg.Is<string>(
                    body => body.Contains($"http://localhost/projects/{Project02}?sharing=true&shareKey=1234abc")
                )
            );
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project02);
        Assert.That(projectSecret.ShareKeys.Single(sk => sk.Key == "1234abc").ProjectRole, Is.EqualTo(role));
    }

    [Test]
    public async Task InviteAsync_SharingDisabled_ForbiddenError()
    {
        var env = new TestEnvironment();
        Assert.ThrowsAsync<ForbiddenException>(
            () =>
                env.Service.InviteAsync(User02, Project01, "newuser@example.com", "en", SFProjectRole.CommunityChecker)
        );
        await env.EmailService.DidNotReceiveWithAnyArgs().SendEmailAsync(default, default, default);
    }

    [Test]
    public async Task InviteAsync_SpecificSharingEnabled_ProjectUserNotInvited()
    {
        var env = new TestEnvironment();
        const string email = "user02@example.com";
        const string role = SFProjectRole.CommunityChecker;
        SFProject project = env.GetProject(Project03);
        Assert.That(project.UserRoles.TryGetValue(User02, out string userRole), Is.True);
        Assert.That(userRole, Is.EqualTo(role), "setup - user should already be a project user");

        Assert.That(await env.Service.InviteAsync(User01, Project03, email, "en", role), Is.False);
        project = env.GetProject(Project03);
        Assert.That(project.UserRoles.ContainsKey(User02), Is.True, "user should still be a project user");

        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
        Assert.That(
            projectSecret.ShareKeys.Any(sk => sk.Email == email),
            Is.False,
            "no sharekey should have been added"
        );

        // Email should not have been sent
        await env.EmailService.DidNotReceiveWithAnyArgs().SendEmailAsync(null, default, default);
    }

    [Test]
    public void InviteAsync_UserNotOnProject_ForbiddenError()
    {
        var env = new TestEnvironment();
        const string email = "newuser@example.com";
        const string role = SFProjectRole.CommunityChecker;
        Assert.DoesNotThrowAsync(() => env.Service.InviteAsync(User02, Project03, email, "en", role));
        Assert.ThrowsAsync<ForbiddenException>(() => env.Service.InviteAsync(User03, Project03, email, "en", role));
    }

    [Test]
    public async Task ReserveLinkSharingKeyAsync_GenerateNewKeyIfMaxUsersReached()
    {
        var env = new TestEnvironment();
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project06);

        Assert.That(
            projectSecret.ShareKeys.Any(
                sk =>
                    sk.Key == "maxUsersReached"
                    && sk.ShareLinkType == ShareLinkType.Recipient
                    && sk.ProjectRole == SFProjectRole.Viewer
                    && sk.UsersGenerated == 250
            ),
            Is.True,
            "setup"
        );
        env.SecurityService.GenerateKey().Returns("newKey");

        string shareLink = await env.Service.GetLinkSharingKeyAsync(
            User07,
            Project06,
            SFProjectRole.Viewer,
            ShareLinkType.Recipient
        );
        Assert.That(shareLink, Is.EqualTo("newKey"));
        projectSecret = env.ProjectSecrets.Get(Project06);
        Assert.That(
            projectSecret.ShareKeys.Any(
                sk =>
                    sk.Key == "newKey"
                    && sk.ShareLinkType == ShareLinkType.Recipient
                    && sk.ProjectRole == SFProjectRole.Viewer
                    && sk.Reserved == null
                    && sk.UsersGenerated == 0
            ),
            Is.True
        );
    }

    [Test]
    public async Task ReserveLinkSharingKeyAsync_GenerateNewKeyIfReserved()
    {
        var env = new TestEnvironment();
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project06);

        Assert.That(
            projectSecret.ShareKeys.Any(
                sk =>
                    sk.Key == "reservedKey"
                    && sk.ShareLinkType == ShareLinkType.Recipient
                    && sk.ProjectRole == SFProjectRole.Viewer
            ),
            Is.True,
            "setup"
        );
        env.SecurityService.GenerateKey().Returns("newKey");

        string shareLink = await env.Service.GetLinkSharingKeyAsync(
            User07,
            Project06,
            SFProjectRole.Viewer,
            ShareLinkType.Recipient
        );
        Assert.That(shareLink, Is.EqualTo("newKey"));
        projectSecret = env.ProjectSecrets.Get(Project06);
        Assert.That(
            projectSecret.ShareKeys.Any(
                sk =>
                    sk.Key == "newKey"
                    && sk.ShareLinkType == ShareLinkType.Recipient
                    && sk.ProjectRole == SFProjectRole.Viewer
                    && sk.Reserved == null
            ),
            Is.True
        );
    }

    [Test]
    public void GetProjectSecret_ReturnsSecret()
    {
        var env = new TestEnvironment();
        var shareKey = "abcd";

        // SUT
        SFProjectSecret projectSecret = env.Service.GetProjectSecretByShareKey(shareKey);

        Assert.AreEqual(projectSecret.Id, Project01);
    }

    [Test]
    public void GetProjectSecret_ThrowsOnNotFound()
    {
        var env = new TestEnvironment();
        var shareKey = "invalid";

        // SUT
        Assert.Throws<DataNotFoundException>(() => env.Service.GetProjectSecretByShareKey(shareKey));
    }

    [Test]
    public async Task GetLinkSharingKeyAsync_LinkDoesNotExist_NewShareKeyCreated()
    {
        var env = new TestEnvironment();
        await env.Service.UpdateSettingsAsync(User01, Project03, new SFProjectSettings { });
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);
        Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == null), Is.False);
        env.SecurityService.GenerateKey().Returns("newkey");

        string shareLink = await env.Service.GetLinkSharingKeyAsync(
            User02,
            Project03,
            SFProjectRole.CommunityChecker,
            ShareLinkType.Anyone
        );
        Assert.That(shareLink, Is.EqualTo("newkey"));
        projectSecret = env.ProjectSecrets.Get(Project03);
        Assert.That(
            projectSecret.ShareKeys.Single(sk => sk.Email == null && sk.ExpirationTime == null).Key,
            Is.EqualTo("newkey")
        );
    }

    [Test]
    public async Task GetLinkSharingKeyAsync_LinkExists_ReturnsExistingKey()
    {
        var env = new TestEnvironment();
        const string role = SFProjectRole.CommunityChecker;
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project02);

        Assert.That(
            projectSecret.ShareKeys.Any(sk => sk.Email == null && sk.ProjectRole == role),
            Is.True,
            "setup - a link sharing key should exist"
        );
        string shareLink = await env.Service.GetLinkSharingKeyAsync(User02, Project02, role, ShareLinkType.Anyone);
        Assert.That(shareLink, Is.EqualTo("linksharing02"));
    }

    [Test]
    public async Task GetLinkSharingKeyAsync_LinkHasExpired_NewShareKeyCreated()
    {
        var env = new TestEnvironment();
        const string role = SFProjectRole.Viewer;
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project06);

        Assert.That(
            projectSecret.ShareKeys.Any(sk => sk.Key == "expiredKey" && sk.ExpirationTime < DateTime.Now),
            Is.True,
            "setup - a link sharing key should exist"
        );
        env.SecurityService.GenerateKey().Returns("newkey");
        string shareLink = await env.Service.GetLinkSharingKeyAsync(User07, Project06, role, ShareLinkType.Recipient);
        Assert.That(shareLink, Is.EqualTo("newkey"));
    }

    [Test]
    public void GetLinkSharingKeyAsync_LinkSharingDisabled_ForbiddenError()
    {
        var env = new TestEnvironment();
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project01);
        Assert.That(projectSecret.ShareKeys.Count, Is.EqualTo(1));
        Assert.ThrowsAsync<ForbiddenException>(
            async () =>
                await env.Service.GetLinkSharingKeyAsync(
                    User02,
                    Project01,
                    SFProjectRole.CommunityChecker,
                    ShareLinkType.Anyone
                )
        );
        projectSecret = env.ProjectSecrets.Get(Project01);
        Assert.That(projectSecret.ShareKeys.Count, Is.EqualTo(1));
    }

    [Test]
    public async Task GetLinkSharingKeyAsync_UserInvitesObserver_SucceedsForUsersWithRights()
    {
        var env = new TestEnvironment();
        string key = await env.Service.GetLinkSharingKeyAsync(
            User01,
            Project01,
            SFProjectRole.Viewer,
            ShareLinkType.Anyone
        );
        Assert.That(key, Is.Not.Null);
        // An sf observer should have rights to invite another observer
        key = await env.Service.GetLinkSharingKeyAsync(User06, Project01, SFProjectRole.Viewer, ShareLinkType.Anyone);
        Assert.That(key, Is.Not.Null);
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.GetLinkSharingKeyAsync(User02, Project01, SFProjectRole.Viewer, ShareLinkType.Anyone)
        );
    }

    [Test]
    public async Task GetLinkSharingKeyAsync_UserInvitesReviewer_SucceedsForAdmins()
    {
        var env = new TestEnvironment();
        string key = await env.Service.GetLinkSharingKeyAsync(
            User01,
            Project01,
            SFProjectRole.Commenter,
            ShareLinkType.Anyone
        );
        Assert.That(key, Is.Not.Null);
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.GetLinkSharingKeyAsync(User02, Project01, SFProjectRole.Commenter, ShareLinkType.Anyone)
        );
    }

    [Test]
    public async Task IncreaseShareKeyUsersGenerated()
    {
        var env = new TestEnvironment();
        var shareKey = "linksharing02";
        ValidShareKey validShareKey = await env.Service.CheckShareKeyValidity(shareKey);
        Assert.AreEqual(validShareKey.ShareKey.UsersGenerated, 0);

        // SUT
        await env.Service.IncreaseShareKeyUsersGenerated(shareKey);

        validShareKey = await env.Service.CheckShareKeyValidity(shareKey);
        Assert.AreEqual(validShareKey.ShareKey.UsersGenerated, 1);
    }

    [Test]
    public void JoinWithShareKeyAsync_LinkSharingDisabledAndUserOnProject_Success()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project01);
        Assert.That(project.UserRoles.ContainsKey(User02), Is.True, "setup");
        Assert.DoesNotThrowAsync(() => env.Service.JoinWithShareKeyAsync(User02, "abcd"));
    }

    [Test]
    public async Task JoinWithShareKeyAsync_LinkSharingDisabledAndUserNotOnProject_Forbidden()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project02);
        Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
        await env.Service.UpdateSettingsAsync(
            User02,
            Project02,
            new SFProjectSettings { CheckingShareEnabled = false }
        );
        Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.JoinWithShareKeyAsync(User03, "linksharing02"));
    }

    [Test]
    public async Task JoinWithShareKeyAsync_LinkSharingEnabled_UserJoined()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project02);
        Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");

        await env.Service.JoinWithShareKeyAsync(User03, "linksharing02");
        project = env.GetProject(Project02);
        Assert.That(project.UserRoles.TryGetValue(User03, out string userRole), Is.True);
        Assert.That(userRole, Is.EqualTo(SFProjectRole.CommunityChecker));
        User user = env.GetUser(User03);
        Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project02));
    }

    [Test]
    public async Task JoinWithShareKeyAsync_LinkSharingEnabledAndUserHasPTRole_UserJoined()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project04);
        Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
        env.ParatextService.TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), CancellationToken.None)
            .Returns(Task.FromResult(new Attempt<string>(SFProjectRole.Translator)));

        await env.Service.JoinWithShareKeyAsync(User03, "linksharing04");
        project = env.GetProject(Project04);
        Assert.That(project.UserRoles.TryGetValue(User03, out string userRole), Is.True);
        Assert.That(userRole, Is.EqualTo(SFProjectRole.Translator));
        User user = env.GetUser(User03);
        Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project04));
    }

    [Test]
    public async Task JoinWithShareKeyAsync_LinkSharingEnabledAndShareKeyExists_UserJoined()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project02);
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project02);

        Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
        Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "existingkeyuser03"), Is.True, "setup");

        await env.Service.JoinWithShareKeyAsync(User03, "existingkeyuser03");
        project = env.GetProject(Project02);

        Assert.That(project.UserRoles.ContainsKey(User03), Is.True, "User should have been added to project");
    }

    [Test]
    public async Task JoinWithShareKeyAsync_SpecificSharingAlternateUser_UserJoined()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project03);

        Assert.That(project.UserRoles.ContainsKey(User04), Is.False, "setup");
        var invitees = await env.Service.InvitedUsersAsync(User01, Project03);
        Assert.That(
            invitees.Select(i => i.Email),
            Is.EquivalentTo(
                new[] { "bob@example.com", "expired@example.com", "user03@example.com", "bill@example.com" }
            ),
            "setup"
        );

        // Use the sharekey linked to user03
        await env.Service.JoinWithShareKeyAsync(User04, "key1234");
        project = env.GetProject(Project03);

        Assert.That(project.UserRoles.ContainsKey(User04), Is.True, "User should have been added to project");

        invitees = await env.Service.InvitedUsersAsync(User01, Project03);
        Assert.That(
            invitees.Select(i => i.Email),
            Is.EquivalentTo(new[] { "bob@example.com", "expired@example.com", "bill@example.com" })
        );
    }

    [Test]
    public async Task JoinWithShareKeyAsync_SpecificSharingLinkExpired_ForbiddenError()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project03);
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

        Assert.That(project.UserRoles.ContainsKey(LinkExpiredUser), Is.False, "setup");
        Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == "expired@example.com"), Is.True, "setup");

        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.JoinWithShareKeyAsync(LinkExpiredUser, "keyexp"),
            "The user should be forbidden to join the project: Email was in ShareKeys, but code was expired."
        );

        var invitees = await env.Service.InvitedUsersAsync(User01, Project03);
        Assert.That(
            invitees.Select(i => i.Email),
            Is.EquivalentTo(
                new[] { "bob@example.com", "expired@example.com", "user03@example.com", "bill@example.com" }
            )
        );
    }

    [Test]
    public void JoinWithShareKeyAsync_SpecificSharingAndWrongCode_ForbiddenError()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project03);
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

        Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
        Assert.That(projectSecret.ShareKeys.Any(sk => sk.Email == "user03@example.com"), Is.True, "setup");

        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.JoinWithShareKeyAsync(User03, "badcode"),
            "The user should be forbidden to join the project: Email address was in ShareKeys list, but wrong code was given."
        );
    }

    [Test]
    public async Task JoinWithShareKeyAsync_SpecificSharingAndRightKey_UserJoined()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project03);
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

        Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
        Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.True, "setup");
        Assert.That(projectSecret.ShareKeys.Count, Is.EqualTo(4), "setup");

        await env.Service.JoinWithShareKeyAsync(User03, "key1234");

        project = env.GetProject(Project03);

        Assert.That(project.UserRoles.ContainsKey(User03), Is.True, "User should have been added to project");
    }

    [Test]
    public async Task JoinWithShareKeyAsync_SpecificSharingAndRecipientPreviouslyJoined()
    {
        var env = new TestEnvironment();
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project06);

        Assert.That(
            projectSecret.ShareKeys.Any(sk => sk.Key == "usedKey" && sk.RecipientUserId == User02),
            Is.True,
            "setup"
        );

        Assert.That(await env.Service.JoinWithShareKeyAsync(User02, "usedKey"), Is.EqualTo(Project06));
    }

    [Test]
    public async Task JoinWithShareKeyAsync_ShareDisabledAndKeyValid_UserJoined()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project03);
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

        Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
        Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.True, "setup");
        Assert.That(projectSecret.ShareKeys.Count, Is.EqualTo(4), "setup");

        await env.Service.UpdateSettingsAsync(
            User01,
            Project03,
            new SFProjectSettings { CheckingShareEnabled = false }
        );
        project = env.GetProject(Project03);
        Assert.That(project.CheckingConfig.ShareEnabled, Is.False, "setup");
        await env.Service.JoinWithShareKeyAsync(User03, "key1234");

        project = env.GetProject(Project03);

        Assert.That(project.UserRoles.ContainsKey(User03), Is.True, "User should have been added to project");
    }

    [Test]
    public async Task JoinWithShareKeyAsync_PTUserHasPTPermissions()
    {
        // If a user is invited to a project, and goes to the invitation link, the user being added to the project
        // should have their PT permissions for text books and chapters.

        var env = new TestEnvironment();
        string project05PTId = "paratext_" + Project05;
        SFProject project = env.GetProject(Project05);
        SFProject resource = env.GetProject(Resource01);

        Assert.That(env.UserSecrets.Contains(User03), Is.True, "setup. PT user should have user secrets.");
        User user = env.GetUser(User03);
        Assert.That(user.ParatextId, Is.Not.Null, "setup. PT user should have a PT User ID.");

        string userRoleOnPTProject = SFProjectRole.Translator;
        Assert.That(
            userRoleOnPTProject,
            Is.Not.EqualTo(SFProjectRole.CommunityChecker),
            "setup. role should be different than community checker for purposes of part of what this test is testing."
        );
        string shareKeyCode = "key12345";
        ShareKey shareKeyForUserInvitation = env.ProjectSecrets.Get(project.Id)
            .ShareKeys.First((ShareKey shareKey) => shareKey.Key == shareKeyCode);
        Assert.That(
            shareKeyForUserInvitation.ProjectRole,
            Is.EqualTo(SFProjectRole.CommunityChecker),
            "setup. the user should be being invited as a community checker."
        );
        env.ParatextService.TryGetProjectRoleAsync(
            Arg.Any<UserSecret>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>()
        )
            .Returns(Task.FromResult(Attempt.Success(userRoleOnPTProject)));
        string userDBLPermissionForResource = TextInfoPermission.Read;
        env.ParatextService.GetResourcePermissionAsync(Arg.Any<string>(), User03, Arg.Any<CancellationToken>())
            .Returns<Task<string>>(Task.FromResult(userDBLPermissionForResource));

        Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
        Assert.That(project.Texts.First().Permissions.ContainsKey(User03), Is.False, "setup");
        Assert.That(project.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");
        Assert.That(resource.UserRoles.ContainsKey(User03), Is.False, "setup");
        Assert.That(project.Texts.First().Permissions.ContainsKey(User03), Is.False, "setup");
        Assert.That(project.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");

        var bookList = new List<int>() { 40, 41 };
        env.ParatextService.GetBookList(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(bookList);

        // PT will answer with these permissions.
        var ptBookPermissions = new Dictionary<string, string>()
        {
            { User03, TextInfoPermission.Read },
            { User01, TextInfoPermission.Read },
        };
        var ptChapterPermissions = new Dictionary<string, string>()
        {
            { User03, TextInfoPermission.Write },
            { User01, TextInfoPermission.Read },
        };
        var ptSourcePermissions = new Dictionary<string, string>()
        {
            { User03, userDBLPermissionForResource },
            { User01, TextInfoPermission.None },
        };
        const int bookValueToIndicateWholeResource = 0;
        const int chapterValueToIndicateWholeBook = 0;
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptBookPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            Arg.Is<int>((int arg) => arg > 0)
        )
            .Returns(Task.FromResult(ptChapterPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == Resource01PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            bookValueToIndicateWholeResource,
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptSourcePermissions));

        // SUT
        await env.Service.JoinWithShareKeyAsync(User03, shareKeyCode);

        project = env.GetProject(Project05);
        Assert.That(
            project.UserRoles.TryGetValue(User03, out string userRole),
            Is.True,
            "user should be added to project"
        );
        // This user was invited as a community checker (according to the share key). But their project role and
        // permissions will reflect what is set on the PT project. The user will have a translator role rather than
        // a community checker role.
        Assert.That(userRole, Is.EqualTo(userRoleOnPTProject));
        user = env.GetUser(User03);
        Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project05));

        Assert.That(project.Texts.First().Permissions[User03], Is.EqualTo(TextInfoPermission.Read));
        Assert.That(project.Texts.First().Chapters.First().Permissions[User03], Is.EqualTo(TextInfoPermission.Write));

        resource = env.GetProject(Resource01);
        Assert.That(
            resource.UserRoles.TryGetValue(User03, out string resourceUserRole),
            Is.True,
            "user should have been added to resource"
        );
        Assert.That(resourceUserRole, Is.EqualTo(SFProjectRole.PTObserver), "user role not set correctly on resource");
        Assert.That(user.Sites[SiteId].Projects, Contains.Item(Resource01), "user not added to resource correctly");
        Assert.That(resource.Texts.First().Permissions[User03], Is.EqualTo(userDBLPermissionForResource));
        Assert.That(
            resource.Texts.First().Chapters.First().Permissions[User03],
            Is.EqualTo(userDBLPermissionForResource)
        );
    }

    [Test]
    public async Task JoinWithShareKeyAsync_NonPTUser()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project05);

        Assert.That(
            env.UserSecrets.Contains(User04),
            Is.False,
            "setup. Non-PT user is not expected to have user secrets."
        );
        User user = env.GetUser(User04);
        Assert.That(user.ParatextId, Is.Null, "setup. Non-PT user should not have a PT User ID.");

        Assert.That(project.UserRoles.ContainsKey(User04), Is.False, "setup");
        Assert.That(project.Texts.First().Permissions.ContainsKey(User04), Is.False, "setup");
        Assert.That(project.Texts.First().Chapters.First().Permissions.ContainsKey(User04), Is.False, "setup");

        // SUT
        await env.Service.JoinWithShareKeyAsync(User04, "key12345");

        project = env.GetProject(Project05);
        Assert.That(project.UserRoles.TryGetValue(User04, out string userRole), Is.True, "user was added to project");
        Assert.That(userRole, Is.EqualTo(SFProjectRole.CommunityChecker));
        user = env.GetUser(User04);
        Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project05));

        Assert.That(
            project.Texts.First().Permissions.ContainsKey(User04),
            Is.False,
            "no permissions should have been specified for user"
        );
        Assert.That(
            project.Texts.First().Chapters.First().Permissions.ContainsKey(User04),
            Is.False,
            "no permissions should have been specified for user"
        );

        // The get permission methods shouldn't have even been called.
        await env.ParatextService.DidNotReceiveWithAnyArgs()
            .GetPermissionsAsync(
                Arg.Any<UserSecret>(),
                Arg.Any<SFProject>(),
                Arg.Any<IReadOnlyDictionary<string, string>>(),
                Arg.Any<int>(),
                Arg.Any<int>()
            );
        await env.ParatextService.DidNotReceiveWithAnyArgs()
            .GetResourcePermissionAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>());
    }

    [Test]
    public async Task JoinWithShareKeyAsync_PTUserButNotOfThisProjectAndCannotReadResource()
    {
        // The user joining the project _is_ a PT user, but they do not have a PT role on this particular project.
        // Further, they do not have permission to read the DBL resource.

        var env = new TestEnvironment();
        string project05PTId = "paratext_" + Project05;
        SFProject project = env.GetProject(Project05);
        SFProject resource = env.GetProject(Resource01);

        Assert.That(
            env.UserSecrets.Contains(User03),
            Is.True,
            "setup. This is a PT user and is expected to have user secrets."
        );
        User user = env.GetUser(User03);
        Assert.That(user.ParatextId, Is.Not.Null, "setup. PT user should have a PT User ID.");

        Assert.That(
            project.UserRoles.ContainsKey(User03),
            Is.False,
            "setup. User should not already be on the project."
        );
        Assert.That(
            project.Texts.First().Permissions.ContainsKey(User03),
            Is.False,
            "setup. User should not already have permissions on the project."
        );
        Assert.That(project.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");
        Assert.That(
            resource.UserRoles.ContainsKey(User03),
            Is.False,
            "setup. User should not already be on the project."
        );
        Assert.That(
            resource.Texts.First().Permissions.ContainsKey(User03),
            Is.False,
            "setup. User should not have permissions."
        );
        Assert.That(resource.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");

        // If the user is not a member of the paratext project, then
        // "GET https://registry-dev.paratext.org/api8/projects/PT_PROJECT_ID/members" will return a 404 Not Found,
        // and in ParatextService.CallApiAsync() there originates a System.Net.Http.HttpRequestException or perhaps
        // EdjCase.JsonRpc.Common.RpcException. Our test should not end up doing down a path that causes this
        // exception.
        env.ParatextService.GetParatextUsernameMappingAsync(
            Arg.Is<UserSecret>((UserSecret userSecret) => userSecret.Id == User03),
            Arg.Is((SFProject project) => project.ParatextId == project05PTId),
            Arg.Any<CancellationToken>()
        )
            .Returns(
                Task.FromException<IReadOnlyDictionary<string, string>>(new System.Net.Http.HttpRequestException())
            );

        string userRoleOnPTProject = null;
        env.ParatextService.TryGetProjectRoleAsync(
            Arg.Any<UserSecret>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>()
        )
            .Returns(Task.FromResult(Attempt.Failure(userRoleOnPTProject)));
        string userDBLPermissionForResource = TextInfoPermission.None;
        env.ParatextService.GetResourcePermissionAsync(Arg.Any<string>(), User03, Arg.Any<CancellationToken>())
            .Returns<Task<string>>(Task.FromResult(userDBLPermissionForResource));

        env.ParatextService.GetBookList(Arg.Any<UserSecret>(), Arg.Any<string>())
            .Returns(x => throw new Exception("Probably can not do this."));

        // PT could answer with these permissions.
        var ptBookPermissions = new Dictionary<string, string>()
        {
            { User02, TextInfoPermission.Read },
            { User01, TextInfoPermission.Read },
        };
        var ptChapterPermissions = new Dictionary<string, string>()
        {
            { User02, TextInfoPermission.Write },
            { User01, TextInfoPermission.Read },
        };
        var ptSourcePermissions = new Dictionary<string, string>()
        {
            { User02, TextInfoPermission.Read },
            { User01, TextInfoPermission.Read },
        };
        const int bookValueToIndicateWholeResource = 0;
        const int chapterValueToIndicateWholeBook = 0;
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptBookPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            Arg.Is<int>((int arg) => arg > 0)
        )
            .Returns(Task.FromResult(ptChapterPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == Resource01PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            bookValueToIndicateWholeResource,
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptSourcePermissions));

        // SUT
        await env.Service.JoinWithShareKeyAsync(User03, "key12345");

        project = env.GetProject(Project05);
        Assert.That(
            project.UserRoles.TryGetValue(User03, out string userRole),
            Is.True,
            "user should have been added to project"
        );
        Assert.That(userRole, Is.EqualTo(SFProjectRole.CommunityChecker));
        user = env.GetUser(User03);
        Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project05), "user not added to project correctly");

        Assert.That(
            project.Texts.First().Permissions.ContainsKey(User03),
            Is.False,
            "no project permissions should have been specified for user"
        );
        Assert.That(
            project.Texts.First().Chapters.First().Permissions.ContainsKey(User03),
            Is.False,
            "no project permissions should have been specified for user"
        );

        // User03 is not added to the target or source, nor do they have any permissions listed in the source.
        resource = env.GetProject(Resource01);
        Assert.That(
            resource.UserRoles.ContainsKey(User03),
            Is.False,
            "user should not have been added to resource project"
        );
        Assert.That(
            resource.Texts.First().Permissions.ContainsKey(User03),
            Is.False,
            "user should not have permissions to resource"
        );
        Assert.That(
            resource.Texts.First().Chapters.First().Permissions.ContainsKey(User03),
            Is.False,
            "user should not have permissions to resource"
        );
        Assert.That(user.Sites[SiteId].Projects, Does.Not.Contain(Resource01), "user should not have been added to");

        // With the current implementation, both ParatextService.GetPermissionsAsync(for the source resource) and
        // ParatextService.GetPermissionsAsync(for the target project) should be called never. In a future change to
        // the SUT, it's okay if it is called, as long as the permissions don't get applied. But for now, not
        // getting called is a helpful indication of expected operation.
        // The mocks above regarding env.ParatextService.GetPermissionsAsync(for the target project) are left in
        // place in case they begin to be used.
        await env.ParatextService.DidNotReceive()
            .GetPermissionsAsync(
                Arg.Any<UserSecret>(),
                Arg.Is<SFProject>((SFProject sfProject) => sfProject.Id == Project05),
                Arg.Any<IReadOnlyDictionary<string, string>>(),
                Arg.Any<int>(),
                Arg.Any<int>()
            );
        await env.ParatextService.DidNotReceive()
            .GetPermissionsAsync(
                Arg.Any<UserSecret>(),
                Arg.Is<SFProject>((SFProject sfProject) => sfProject.Id == Resource01),
                Arg.Any<IReadOnlyDictionary<string, string>>(),
                Arg.Any<int>(),
                Arg.Any<int>()
            );

        // We may not be able to query a book list for the target project without the user having a PT project role,
        // or of the DBL resource, without the user having read permission.
        env.ParatextService.DidNotReceive().GetBookList(Arg.Any<UserSecret>(), project05PTId);
        env.ParatextService.DidNotReceive().GetBookList(Arg.Any<UserSecret>(), Resource01PTId);
    }

    [Test]
    public async Task JoinWithShareKeyAsync_PTUserButNotOfThisProjectYetReadsResource()
    {
        // The user joining the project _is_ a PT user, but they do not have a PT role on this particular project.
        // Though they do have permission to read the DBL resource.

        var env = new TestEnvironment();
        string project05PTId = "paratext_" + Project05;
        SFProject project = env.GetProject(Project05);
        SFProject resource = env.GetProject(Resource01);

        Assert.That(
            env.UserSecrets.Contains(User03),
            Is.True,
            "setup. This is a PT user and is expected to have user secrets."
        );
        User user = env.GetUser(User03);
        Assert.That(user.ParatextId, Is.Not.Null, "setup. PT user should have a PT User ID.");

        Assert.That(
            project.UserRoles.ContainsKey(User03),
            Is.False,
            "setup. User should not already be on the project."
        );
        Assert.That(
            project.Texts.First().Permissions.ContainsKey(User03),
            Is.False,
            "setup. User should not already have permissions on the project."
        );
        Assert.That(project.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");
        Assert.That(
            resource.UserRoles.ContainsKey(User03),
            Is.False,
            "setup. User should not already be on the project, for purposes of testing that they are later."
        );
        Assert.That(
            resource.Texts.First().Permissions.ContainsKey(User03),
            Is.False,
            "setup. User should not already have permissions."
        );
        Assert.That(resource.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");

        env.ParatextService.GetParatextUsernameMappingAsync(
            Arg.Is<UserSecret>((UserSecret userSecret) => userSecret.Id == User03),
            Arg.Is((SFProject project) => project.ParatextId == project05PTId),
            Arg.Any<CancellationToken>()
        )
            .Returns(
                Task.FromException<IReadOnlyDictionary<string, string>>(new System.Net.Http.HttpRequestException())
            );

        string userRoleOnPTProject = null;
        env.ParatextService.TryGetProjectRoleAsync(
            Arg.Any<UserSecret>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>()
        )
            .Returns(Task.FromResult(Attempt.Failure(userRoleOnPTProject)));
        string userDBLPermissionForResource = TextInfoPermission.Read;
        env.ParatextService.GetResourcePermissionAsync(Arg.Any<string>(), User03, Arg.Any<CancellationToken>())
            .Returns<Task<string>>(Task.FromResult(userDBLPermissionForResource));

        var bookList = new List<int>() { 40, 41 };
        env.ParatextService.GetBookList(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(bookList);

        // PT could answer with these permissions.
        var ptBookPermissions = new Dictionary<string, string>()
        {
            { User02, TextInfoPermission.Read },
            { User01, TextInfoPermission.Read },
        };
        var ptChapterPermissions = new Dictionary<string, string>()
        {
            { User02, TextInfoPermission.Write },
            { User01, TextInfoPermission.Read },
        };
        var ptSourcePermissions = new Dictionary<string, string>()
        {
            { User03, userDBLPermissionForResource },
            { User02, TextInfoPermission.Read },
            { User01, TextInfoPermission.Read },
        };
        const int bookValueToIndicateWholeResource = 0;
        const int chapterValueToIndicateWholeBook = 0;
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptBookPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            Arg.Is<int>((int arg) => arg > 0)
        )
            .Returns(Task.FromResult(ptChapterPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == Resource01PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            bookValueToIndicateWholeResource,
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptSourcePermissions));

        // SUT
        await env.Service.JoinWithShareKeyAsync(User03, "key12345");

        project = env.GetProject(Project05);
        Assert.That(
            project.UserRoles.TryGetValue(User03, out string userRole),
            Is.True,
            "user should have been added to project"
        );
        Assert.That(userRole, Is.EqualTo(SFProjectRole.CommunityChecker));
        user = env.GetUser(User03);
        Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project05), "user not added to project correctly");

        Assert.That(
            project.Texts.First().Permissions.ContainsKey(User03),
            Is.False,
            "no project permissions should have been specified for user"
        );
        Assert.That(
            project.Texts.First().Chapters.First().Permissions.ContainsKey(User03),
            Is.False,
            "no project permissions should have been specified for user"
        );

        // User03 is not on project project05PTId, but they have access to the source resource. So
        // UpdatePermissionsAsync() should be inquiring about this and setting permissions as appropriate.
        await env.ParatextService.Received()
            .GetResourcePermissionAsync(Resource01PTId, User03, Arg.Any<CancellationToken>());
        resource = env.GetProject(Resource01);
        Assert.That(
            resource.Texts.First().Permissions[User03],
            Is.EqualTo(userDBLPermissionForResource),
            "resource permissions should have been set for joining project user"
        );
        Assert.That(
            resource.Texts.First().Chapters.First().Permissions[User03],
            Is.EqualTo(userDBLPermissionForResource),
            "resource permissions should have been set for joining project user"
        );
        Assert.That(
            resource.UserRoles.TryGetValue(User03, out string resourceUserRole),
            Is.True,
            "user should have been added to resource"
        );
        Assert.That(resourceUserRole, Is.EqualTo(SFProjectRole.PTObserver), "user role not set correctly on resource");
        Assert.That(user.Sites[SiteId].Projects, Contains.Item(Resource01), "user not added to resource correctly");

        // With the current implementation, ParatextService.GetPermissionsAsync(for the source resource) should be
        // called once, but ParatextService.GetPermissionsAsync(for the target project) should be called never. In
        // a future change to the SUT, it's okay if it is called for the target project, as long as the permissions
        // don't get applied. But for now, not getting called is a helpful indication of expected operation.
        // The mocks above regarding env.ParatextService.GetPermissionsAsync(for the target project) are left in
        // place in case they begin to be used.
        await env.ParatextService.DidNotReceive()
            .GetPermissionsAsync(
                Arg.Any<UserSecret>(),
                Arg.Is<SFProject>((SFProject sfProject) => sfProject.Id == Project05),
                Arg.Any<IReadOnlyDictionary<string, string>>(),
                Arg.Any<int>(),
                Arg.Any<int>()
            );
        await env.ParatextService.Received(1)
            .GetPermissionsAsync(
                Arg.Any<UserSecret>(),
                Arg.Is<SFProject>((SFProject sfProject) => sfProject.Id == Resource01),
                Arg.Any<IReadOnlyDictionary<string, string>>(),
                Arg.Any<int>(),
                Arg.Any<int>()
            );

        // We may not be able to query a book list for the target project without the user having a PT project role.
        env.ParatextService.DidNotReceive().GetBookList(Arg.Any<UserSecret>(), project05PTId);
        env.ParatextService.Received(1).GetBookList(Arg.Any<UserSecret>(), Resource01PTId);
    }

    [Test]
    public void JoinWithShareKeyAsync_ObserverInvitedToProject_AddedToProject()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project04);
        Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");

        Assert.DoesNotThrowAsync(() => env.Service.JoinWithShareKeyAsync(User03, "linksharing04"));
        project = env.GetProject(Project04);
        Assert.That(project.UserRoles.ContainsKey(User03), Is.True, "user should be added to project");
    }

    [Test]
    public async Task IsAlreadyInvitedAsync_BadInput_False()
    {
        var env = new TestEnvironment();

        Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, null), Is.False);

        Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, ""), Is.False);

        Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, "junk"), Is.False);

        Assert.That(await env.Service.IsAlreadyInvitedAsync(User02, Project02, "nothing"), Is.False);
    }

    [Test]
    public async Task IsAlreadyInvitedAsync_IsInvited_True()
    {
        var env = new TestEnvironment();

        Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, "bob@example.com"), Is.True);
    }

    [Test]
    public async Task IsAlreadyInvitedAsync_NotInvitedButOnProject_False()
    {
        var env = new TestEnvironment();
        Assert.That(
            env.GetProject(Project03).UserRoles.GetValueOrDefault(User01, null),
            Is.EqualTo(SFProjectRole.Administrator)
        );
        Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, "user01@example.com"), Is.False);
        Assert.That(
            env.GetProject(Project02).UserRoles.GetValueOrDefault(User04, null),
            Is.EqualTo(SFProjectRole.CommunityChecker)
        );
        Assert.That(await env.Service.IsAlreadyInvitedAsync(User04, Project02, "user01@example.com"), Is.False);
    }

    [Test]
    public async Task IsAlreadyInvitedAsync_NotInvitedOrOnProject_False()
    {
        var env = new TestEnvironment();

        Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project03, "unheardof@example.com"), Is.False);
        Assert.That(await env.Service.IsAlreadyInvitedAsync(User04, Project02, "nobody@example.com"), Is.False);
    }

    [Test]
    public void IsAlreadyInvitedAsync_CheckingDisabledButCheckingSharingEnabled_Forbidden()
    {
        var env = new TestEnvironment();
        Assert.That(env.GetProject(Project06).CheckingConfig.CheckingEnabled, Is.False);
        Assert.That(env.GetProject(Project06).CheckingConfig.ShareEnabled, Is.True);
        Assert.That(
            env.GetProject(Project06).UserRoles.GetValueOrDefault(User01, null),
            Is.EqualTo(SFProjectRole.CommunityChecker)
        );

        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.IsAlreadyInvitedAsync(User01, Project06, "user@example.com")
        );
    }

    [Test]
    public async Task IsAlreadyInvitedAsync_CheckingSharingDisabledTranslateSharingEnabled_False()
    {
        var env = new TestEnvironment();
        Assert.That(env.GetProject(Project04).CheckingConfig.ShareEnabled, Is.False);
        Assert.That(env.GetProject(Project04).TranslateConfig.ShareEnabled, Is.True);
        Assert.That(await env.Service.IsAlreadyInvitedAsync(User01, Project04, "user@example.com"), Is.False);
    }

    [Test]
    public void IsAlreadyInvitedAsync_InvitingUserNotOnProject_Forbidden()
    {
        var env = new TestEnvironment();
        Assert.That(env.GetProject(Project02).CheckingConfig.CheckingEnabled, Is.True);
        Assert.That(env.GetProject(Project02).CheckingConfig.ShareEnabled, Is.True);
        Assert.That(env.GetProject(Project02).UserRoles.GetValueOrDefault(User01, null), Is.Null);

        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.IsAlreadyInvitedAsync(User01, Project02, "user@example.com")
        );
    }

    [Test]
    public async Task InvitedUsers_Reports()
    {
        var env = new TestEnvironment();
        // Project with no outstanding invitations
        Assert.That((await env.Service.InvitedUsersAsync(User01, Project01)).Count, Is.EqualTo(0));

        // Project with one specific shareKey and one link sharing shareKey record
        IReadOnlyList<InviteeStatus> invitees = await env.Service.InvitedUsersAsync(User02, Project02);
        Assert.That(invitees.Count, Is.EqualTo(1));
        Assert.That(invitees.Select(i => i.Email), Is.EquivalentTo(new string[] { "user03@example.com" }));

        // Project with several outstanding invitations
        invitees = await env.Service.InvitedUsersAsync(User01, Project03);
        Assert.That(invitees.Count, Is.EqualTo(4));
        string[] expectedEmailList =
        {
            "bob@example.com",
            "expired@example.com",
            "user03@example.com",
            "bill@example.com"
        };
        Assert.That(invitees.Select(i => i.Email), Is.EquivalentTo(expectedEmailList));
    }

    [Test]
    public void InvitedUsers_SystemAdmin_NoSpecialAccess()
    {
        var env = new TestEnvironment();

        // User04 is a system admin, but not a project-admin or even a user on Project03
        Assert.That(env.GetProject(Project03).UserRoles.ContainsKey(User04), Is.False, "test setup");
        Assert.That(env.GetUser(User04).Roles.First(), Is.EqualTo(SystemRole.SystemAdmin), "test setup");

        Assert.ThrowsAsync<ForbiddenException>(
            () => (env.Service.InvitedUsersAsync(User04, Project03)),
            "should have been forbidden"
        );
    }

    [Test]
    public void InvitedUsers_NonProjectAdmin_Forbidden()
    {
        var env = new TestEnvironment();
        // User02 is not an admin on Project01
        Assert.That(
            env.GetProject(Project01).UserRoles[User02],
            Is.Not.EqualTo(SFProjectRole.Administrator),
            "test setup"
        );
        Assert.That(env.GetUser(User02).Roles.First(), Is.Not.EqualTo(SystemRole.SystemAdmin), "test setup");
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.InvitedUsersAsync(User02, Project01),
            "should have been forbidden"
        );
    }

    [Test]
    public void InvitedUsers_BadProject_Error()
    {
        var env = new TestEnvironment();

        Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.InvitedUsersAsync(User02, "bad-project-id"));
    }

    [Test]
    public void InvitedUsers_BadUser_Forbidden()
    {
        var env = new TestEnvironment();

        Assert.ThrowsAsync<ForbiddenException>(() => env.Service.InvitedUsersAsync("bad-user-id", Project01));
    }

    [Test]
    public async Task RemoveUser_RemoveAnyShareKeys()
    {
        var env = new TestEnvironment();
        string requestingUser = User07;
        string userToRemove = User02;
        string projectId = Project06;

        Assert.That(
            env.ProjectSecrets.Get(projectId).ShareKeys.Any(sk => sk.RecipientUserId == userToRemove),
            Is.True,
            "setup"
        );

        await env.Service.RemoveUserAsync(requestingUser, projectId, userToRemove);

        Assert.That(
            env.ProjectSecrets.Get(projectId).ShareKeys.Any(sk => sk.RecipientUserId == userToRemove),
            Is.False
        );
    }

    [Test]
    public async Task RemoveUser_RemovesUsersWithMissingProjectUserConfig()
    {
        var env = new TestEnvironment();
        string requestingUser = User07;
        string userToRemove = User02;
        string projectId = Project06;
        string projectUserConfigId = SFProjectUserConfig.GetDocId(projectId, userToRemove);
        Assert.IsTrue(env.GetProject(projectId).UserRoles.ContainsKey(userToRemove));

        // Delete the project user config
        int deleted = await env.RealtimeService.GetRepository<SFProjectUserConfig>()
            .DeleteAllAsync(p => p.Id == projectUserConfigId);
        Assert.AreEqual(1, deleted);

        // SUT
        await env.Service.RemoveUserAsync(requestingUser, projectId, userToRemove);
        Assert.IsFalse(env.GetProject(projectId).UserRoles.ContainsKey(userToRemove));
    }

    [Test]
    public void UninviteUser_BadProject_Error()
    {
        var env = new TestEnvironment();
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.UninviteUserAsync(User02, "nonexistent-project", "some@email.com")
        );
    }

    [Test]
    public void UninviteUser_NonProjectAdmin_Error()
    {
        var env = new TestEnvironment();
        // User02 is not an admin on Project01
        Assert.That(
            env.GetProject(Project01).UserRoles[User02],
            Is.Not.EqualTo(SFProjectRole.Administrator),
            "test setup"
        );
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.UninviteUserAsync(User02, Project01, "some@email.com"),
            "should have been forbidden"
        );
    }

    [Test]
    public async Task UninviteUser_BadEmail_Ignored()
    {
        var env = new TestEnvironment();
        var initialInvitationCount = 4;
        Assert.That(
            (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
            Is.EqualTo(initialInvitationCount),
            "test setup"
        );

        await env.Service.UninviteUserAsync(User01, Project03, "unknown@email.com");
        Assert.That(
            (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
            Is.EqualTo(initialInvitationCount),
            "should not have changed"
        );
    }

    [Test]
    public async Task UninviteUser_RemovesInvitation()
    {
        var env = new TestEnvironment();
        var initialInvitationCount = 4;
        Assert.That(
            (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
            Is.EqualTo(initialInvitationCount),
            "test setup"
        );
        Assert.That(
            (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Any(sk => sk.Email == "bob@example.com"),
            Is.True,
            "test setup"
        );
        Assert.That(
            (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
            Is.EqualTo(initialInvitationCount),
            "test setup"
        );

        await env.Service.UninviteUserAsync(User01, Project03, "bob@example.com");
        Assert.That(
            (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Count,
            Is.EqualTo(initialInvitationCount - 1),
            "unexpected number of outstanding invitations"
        );
        Assert.That(
            (await env.ProjectSecrets.GetAsync(Project03)).ShareKeys.Any(sk => sk.Email == "bob@example.com"),
            Is.False,
            "should not still have uninvited email address"
        );
    }

    [Test]
    public void UninviteUser_SystemAdmin_NoSpecialAccess()
    {
        var env = new TestEnvironment();
        // User04 is a system admin, but not a project-admin or even a user on Project03
        Assert.That(env.GetProject(Project03).UserRoles.ContainsKey(User04), Is.False, "test setup");
        Assert.That(env.GetUser(User04).Roles.First(), Is.EqualTo(SystemRole.SystemAdmin), "test setup");

        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.UninviteUserAsync(User04, Project03, "bob@example.com"),
            "should have been forbidden"
        );
    }

    [Test]
    public async Task AddUserAsync_ShareKeyExists_AddsUserAndRemovesKey()
    {
        var env = new TestEnvironment();
        SFProject project = env.GetProject(Project03);
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project03);

        Assert.That(project.UserRoles.ContainsKey(User03), Is.False, "setup");
        Assert.That(projectSecret.ShareKeys.Any(sk => sk.Key == "key1234"), Is.True, "setup");
        env.ParatextService.TryGetProjectRoleAsync(
            Arg.Any<UserSecret>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>()
        )
            .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Translator)));

        await env.Service.AddUserAsync(User03, Project03, null);
        project = env.GetProject(Project03);

        Assert.That(project.UserRoles.ContainsKey(User03), Is.True, "User should have been added to project");
    }

    [Test]
    public void AddUserAsync_SourceProjectUnavailable_SkipProject()
    {
        var env = new TestEnvironment();
        env.ParatextService.TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), CancellationToken.None)
            .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Translator)));
        Assert.DoesNotThrowAsync(() => env.Service.AddUserAsync(User03, Project04, SFProjectRole.Translator));
        var project = env.GetProject(Project04);
        Assert.That(project.UserRoles[User03], Is.EqualTo(SFProjectRole.Translator));
    }

    [Test]
    public async Task AddUserAsync_PTUserHasPTPermissions()
    {
        // If a user connects to an existing project from the Connect Project page, project text permissions should
        // be updated, so that the connecting user has permissions set that are from PT.

        var env = new TestEnvironment();
        string project05PTId = "paratext_" + Project05;
        SFProject project = env.GetProject(Project05);
        SFProject resource = env.GetProject(Resource01);

        Assert.That(env.UserSecrets.Contains(User03), Is.True, "setup. PT user should have user secrets.");
        User user = env.GetUser(User03);
        Assert.That(user.ParatextId, Is.Not.Null, "setup. PT user should have a PT User ID.");

        Assert.That(
            project.UserRoles.ContainsKey(User03),
            Is.False,
            "setup. User should not already be on the project."
        );
        Assert.That(
            project.Texts.First().Permissions.ContainsKey(User03),
            Is.False,
            "setup. User should not already have permissions on the project."
        );
        Assert.That(project.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");
        Assert.That(
            resource.UserRoles.ContainsKey(User03),
            Is.False,
            "setup. User should not already be on the project, for purposes of testing that they are later."
        );
        Assert.That(
            resource.Texts.First().Permissions.ContainsKey(User03),
            Is.False,
            "setup. User should not already have permissions."
        );
        Assert.That(resource.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");

        string userRoleOnPTProject = SFProjectRole.Translator;
        env.ParatextService.TryGetProjectRoleAsync(
            Arg.Any<UserSecret>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>()
        )
            .Returns(Task.FromResult(Attempt.Success(userRoleOnPTProject)));
        string userDBLPermissionForResource = TextInfoPermission.Read;
        env.ParatextService.GetResourcePermissionAsync(Arg.Any<string>(), User03, Arg.Any<CancellationToken>())
            .Returns<Task<string>>(Task.FromResult(userDBLPermissionForResource));

        var bookList = new List<int>() { 40, 41 };
        env.ParatextService.GetBookList(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(bookList);

        // PT will answer with these permissions.
        var ptBookPermissions = new Dictionary<string, string>()
        {
            { User03, TextInfoPermission.Read },
            { User01, TextInfoPermission.Read },
        };
        var ptChapterPermissions = new Dictionary<string, string>()
        {
            { User03, TextInfoPermission.Write },
            { User01, TextInfoPermission.Read },
        };
        var ptSourcePermissions = new Dictionary<string, string>()
        {
            { User03, TextInfoPermission.Read },
            { User01, TextInfoPermission.None },
        };
        const int bookValueToIndicateWholeResource = 0;
        const int chapterValueToIndicateWholeBook = 0;
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptBookPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project05PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            Arg.Is<int>((int arg) => arg > 0)
        )
            .Returns(Task.FromResult(ptChapterPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == Resource01PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            bookValueToIndicateWholeResource,
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptSourcePermissions));

        string projectRoleSpecifiedFromConnectProjectPage = null;

        // SUT
        await env.Service.AddUserAsync(User03, Project05, projectRoleSpecifiedFromConnectProjectPage);

        project = env.GetProject(Project05);
        Assert.That(
            project.UserRoles.TryGetValue(User03, out string userRole),
            Is.True,
            "user should be added to project"
        );
        Assert.That(userRole, Is.EqualTo(userRoleOnPTProject));
        user = env.GetUser(User03);
        Assert.That(user.Sites[SiteId].Projects, Contains.Item(Project05));

        Assert.That(project.Texts.First().Permissions[User03], Is.EqualTo(TextInfoPermission.Read));
        Assert.That(project.Texts.First().Chapters.First().Permissions[User03], Is.EqualTo(TextInfoPermission.Write));

        resource = env.GetProject(Resource01);
        Assert.That(resource.Texts.First().Permissions[User03], Is.EqualTo(userDBLPermissionForResource));
        Assert.That(
            resource.Texts.First().Chapters.First().Permissions[User03],
            Is.EqualTo(userDBLPermissionForResource)
        );
        Assert.That(
            resource.UserRoles.TryGetValue(User03, out string resourceUserRole),
            Is.True,
            "user should have been added to resource"
        );
        Assert.That(resourceUserRole, Is.EqualTo(SFProjectRole.PTObserver), "user role not set correctly on resource");
        Assert.That(user.Sites[SiteId].Projects, Contains.Item(Resource01), "user not added to resource correctly");
    }

    [Test]
    public async Task AddUserAsync_HasSourceProjectRole_AddedToSourceProject()
    {
        var env = new TestEnvironment();
        SFProject project03 = env.GetProject(Project03);
        SFProject source = env.GetProject(SourceOnly);
        Assert.That(project03.UserRoles.ContainsKey(User03), Is.False, "setup");
        Assert.That(source.UserRoles.ContainsKey(User03), Is.False, "setup");
        User user = env.GetUser(User03);
        Assert.That(user.Sites[SiteId].Projects, Is.Empty);
        env.ParatextService.TryGetProjectRoleAsync(Arg.Any<UserSecret>(), Arg.Any<string>(), CancellationToken.None)
            .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Translator)));

        await env.Service.AddUserAsync(User03, Project03, SFProjectRole.Translator);
        project03 = env.GetProject(Project03);
        source = env.GetProject(SourceOnly);
        Assert.That(project03.UserRoles.ContainsKey(User03));
        Assert.That(source.UserRoles.ContainsKey(User03));
        user = env.GetUser(User03);
        Assert.That(user.Sites[SiteId].Projects, Is.EquivalentTo(new[] { Project03, SourceOnly }));
    }

    [Test]
    public async Task ReserveLinkSharingKeyAsync_MarkAsReserved()
    {
        var env = new TestEnvironment();
        SFProjectSecret projectSecret = env.ProjectSecrets.Get(Project06);

        Assert.That(
            projectSecret.ShareKeys.Any(
                sk =>
                    sk.Key == "toBeReservedKey"
                    && sk.ShareLinkType == ShareLinkType.Recipient
                    && sk.ProjectRole == SFProjectRole.Commenter
                    && sk.ExpirationTime == null
                    && sk.Reserved == null
            ),
            Is.True,
            "setup"
        );

        await env.Service.ReserveLinkSharingKeyAsync(User07, "toBeReservedKey");

        projectSecret = env.ProjectSecrets.Get(Project06);

        Assert.That(
            projectSecret.ShareKeys.Any(
                sk =>
                    sk.Key == "toBeReservedKey"
                    && sk.ShareLinkType == ShareLinkType.Recipient
                    && sk.ProjectRole == SFProjectRole.Commenter
                    && sk.ExpirationTime > DateTime.Now
                    && sk.Reserved == true
            ),
            Is.True
        );
    }

    [Test]
    public async Task UpdatePermissionsAsync_SkipsBookNotInDB()
    {
        // If a user connects a new project, and we seek to set permissions for the user before actually
        // synchronizing the Scripture text, then we are missing texts on which to set permissions when running
        // UpdatePermissionsAsync(). So silently ignore missing books.
        // It also is conceivable that a race could occur where (1) a book is added in Paratext and SendReceived
        // to the Paratext servers, (2) a SF user clicks Synchronize in SF, (3) SF RunAsync() gets as far as
        // running ParatextService.SendReceiveAsync(), but doesn't yet add the new book from PT into the SF DB.
        // (4) Another SF user joins the SF project, causing UpdatePermissionsAsync() to be called.
        // (5) UpdatePermissionsAsync() queries for ParatextService.GetBookList(), and then tries to find the
        // books (including the new book) in the SF project. (6) It doesn't find the new book in SF.
        // Silently ignoring this situation will prevent a crash from 6. And whether the new user will have
        // permissions for the new book and its chapters will depend on how smart ParatextSyncRunner's project doc
        // is.

        string project01PTId = "paratext_" + Project01;
        var env = new TestEnvironment();
        SFProject sfProject = env.GetProject(Project01);
        // The SF DB should only have 2 books
        Assert.That(sfProject.Texts.Count, Is.LessThan(3), "setup");

        // But PT reports that there are 3 books.
        env.ParatextService.GetBookList(Arg.Any<UserSecret>(), project01PTId).Returns(new List<int>() { 40, 41, 42 });

        var ptBookPermissions = new Dictionary<string, string>()
        {
            { User01, TextInfoPermission.Read },
            { User02, TextInfoPermission.Write },
        };
        var ptChapterPermissions = new Dictionary<string, string>()
        {
            { User01, TextInfoPermission.Write },
            { User02, TextInfoPermission.Read },
        };
        const int chapterValueToIndicateWholeBook = 0;
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptBookPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            Arg.Is<int>((int arg) => arg > 0)
        )
            .Returns(Task.FromResult(ptChapterPermissions));

        sfProject = env.GetProject(Project01);
        Assert.That(sfProject.Texts.First().Permissions.Count, Is.EqualTo(0), "setup");
        Assert.That(sfProject.Texts.First().Chapters.First().Permissions.Count, Is.EqualTo(0), "setup");

        await using IConnection conn = await env.RealtimeService.ConnectAsync(User01);
        IDocument<SFProject> project01Doc = await conn.FetchAsync<SFProject>(Project01);

        // SUT
        await env.Service.UpdatePermissionsAsync(User01, project01Doc, CancellationToken.None);

        // Permissions were set for the books and chapters that we were able to handle.
        sfProject = env.GetProject(Project01);
        Assert.That(sfProject.Texts.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Read));
        Assert.That(sfProject.Texts.First().Permissions[User02], Is.EqualTo(TextInfoPermission.Write));
        Assert.That(sfProject.Texts.First().Chapters.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Write));
        Assert.That(sfProject.Texts.First().Chapters.First().Permissions[User02], Is.EqualTo(TextInfoPermission.Read));

        // SF should still only have the 2 books.
        Assert.That(sfProject.Texts.Count, Is.LessThan(3), "surprise");
    }

    [Test]
    public async Task UpdatePermissionsAsync_ThrowsIfUserHasNoSecrets()
    {
        string project01PTId = "paratext_" + Project01;
        var env = new TestEnvironment();
        env.ParatextService.GetBookList(Arg.Any<UserSecret>(), project01PTId).Returns(new List<int>() { 40, 41 });
        Assert.That(env.ProjectSecrets.Contains(User04), Is.False, "setup");

        await using IConnection conn = await env.RealtimeService.ConnectAsync(User04);
        IDocument<SFProject> project01Doc = await conn.FetchAsync<SFProject>(Project01);

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.UpdatePermissionsAsync(User04, project01Doc, CancellationToken.None)
        );
    }

    [Test]
    public async Task UpdatePermissionsAsync_SetsBookAndChapterPermissions()
    {
        var env = new TestEnvironment();
        string project01PTId = "paratext_" + Project01;

        env.ParatextService.GetBookList(Arg.Any<UserSecret>(), project01PTId).Returns(new List<int>() { 40, 41 });

        var ptBookPermissions = new Dictionary<string, string>
        {
            { User01, TextInfoPermission.Read },
            { User02, TextInfoPermission.Write },
        };
        var ptChapterPermissions = new Dictionary<string, string>
        {
            { User01, TextInfoPermission.Write },
            { User02, TextInfoPermission.Read },
        };
        const int chapterValueToIndicateWholeBook = 0;
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptBookPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            Arg.Is<int>((int arg) => arg > 0)
        )
            .Returns(Task.FromResult(ptChapterPermissions));

        SFProject sfProject = env.GetProject(Project01);
        Assert.That(sfProject.Texts.First().Permissions.Count, Is.EqualTo(0), "setup");
        Assert.That(sfProject.Texts.First().Chapters.First().Permissions.Count, Is.EqualTo(0), "setup");

        await using IConnection conn = await env.RealtimeService.ConnectAsync(User01);
        IDocument<SFProject> project01Doc = await conn.FetchAsync<SFProject>(Project01);

        // SUT
        await env.Service.UpdatePermissionsAsync(User01, project01Doc, CancellationToken.None);

        sfProject = env.GetProject(Project01);
        Assert.That(sfProject.Texts.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Read));
        Assert.That(sfProject.Texts.First().Permissions[User02], Is.EqualTo(TextInfoPermission.Write));
        Assert.That(sfProject.Texts.First().Chapters.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Write));
        Assert.That(sfProject.Texts.First().Chapters.First().Permissions[User02], Is.EqualTo(TextInfoPermission.Read));
    }

    [Test]
    public async Task UpdatePermissionsAsync_UserHasNoChapterPermission()
    {
        var env = new TestEnvironment();
        string project01PTId = "paratext_" + Project01;

        env.ParatextService.GetBookList(Arg.Any<UserSecret>(), project01PTId).Returns(new List<int>() { 40, 41 });

        var ptBookPermissions = new Dictionary<string, string>
        {
            { User01, TextInfoPermission.Read },
            { User02, TextInfoPermission.None },
        };
        var ptChapterPermissions = new Dictionary<string, string>
        {
            { User01, TextInfoPermission.Read },
            { User02, TextInfoPermission.None },
        };
        const int chapterValueToIndicateWholeBook = 0;
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptBookPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            Arg.Is<int>((int arg) => arg > 0)
        )
            .Returns(Task.FromResult(ptChapterPermissions));

        SFProject sfProject = env.GetProject(Project01);
        Assert.That(sfProject.Texts.First().Permissions.Count, Is.EqualTo(0), "setup");
        Assert.That(sfProject.Texts.First().Chapters.First().Permissions.Count, Is.EqualTo(0), "setup");

        await using IConnection conn = await env.RealtimeService.ConnectAsync(User01);
        IDocument<SFProject> project01Doc = await conn.FetchAsync<SFProject>(Project01);

        // SUT
        await env.Service.UpdatePermissionsAsync(User01, project01Doc, CancellationToken.None);

        sfProject = env.GetProject(Project01);
        Assert.That(sfProject.Texts.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Read));
        Assert.That(sfProject.Texts.First().Permissions[User02], Is.EqualTo(TextInfoPermission.None));
        Assert.That(sfProject.Texts.First().Chapters.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Read));
        Assert.That(sfProject.Texts.First().Chapters.First().Permissions[User02], Is.EqualTo(TextInfoPermission.None));
    }

    [Test]
    public async Task UpdatePermissionsAsync_SetsResourcePermissions()
    {
        var env = new TestEnvironment();
        string project01PTId = "paratext_" + Project01;

        var bookList = new List<int> { 40, 41 };
        env.ParatextService.GetBookList(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(bookList);

        var ptBookPermissions = new Dictionary<string, string>
        {
            { User01, TextInfoPermission.Write },
            { User02, TextInfoPermission.Write },
        };
        var ptChapterPermissions = new Dictionary<string, string>
        {
            { User01, TextInfoPermission.Write },
            { User02, TextInfoPermission.Write },
        };
        var ptSourcePermissions = new Dictionary<string, string>
        {
            { User01, TextInfoPermission.Read },
            { User02, TextInfoPermission.None },
        };
        const int bookValueToIndicateWholeResource = 0;
        const int chapterValueToIndicateWholeBook = 0;
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptBookPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == project01PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            Arg.Is<int>((int arg) => arg > 0)
        )
            .Returns(Task.FromResult(ptChapterPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == Resource01PTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            bookValueToIndicateWholeResource,
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptSourcePermissions));

        SFProject sfProject = env.GetProject(Project01);
        Assert.That(sfProject.Texts.First().Permissions.Count, Is.EqualTo(0), "setup");
        Assert.That(sfProject.Texts.First().Chapters.First().Permissions.Count, Is.EqualTo(0), "setup");

        SFProject resource = env.GetProject(Resource01);
        Assert.That(resource.Texts.First().Permissions.Count, Is.EqualTo(0), "setup");
        Assert.That(resource.Texts.First().Chapters.First().Permissions.Count, Is.EqualTo(0), "setup");

        await using IConnection conn = await env.RealtimeService.ConnectAsync(User01);
        IDocument<SFProject> project01Doc = await conn.FetchAsync<SFProject>(Project01);
        IDocument<SFProject> resource01Doc = await conn.FetchAsync<SFProject>(Resource01);

        // SUT 1 - Setting target project permissions continues to work as expected.
        await env.Service.UpdatePermissionsAsync(User01, project01Doc, CancellationToken.None);
        // SUT 2 - Resource permissions are set.
        await env.Service.UpdatePermissionsAsync(User01, resource01Doc, CancellationToken.None);

        sfProject = env.GetProject(Project01);
        resource = env.GetProject(Resource01);
        Assert.That(sfProject.Texts.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Write));
        Assert.That(sfProject.Texts.First().Permissions[User02], Is.EqualTo(TextInfoPermission.Write));
        Assert.That(sfProject.Texts.First().Chapters.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Write));
        Assert.That(sfProject.Texts.First().Chapters.First().Permissions[User02], Is.EqualTo(TextInfoPermission.Write));
        Assert.That(resource.Texts.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Read));
        Assert.That(resource.Texts.First().Permissions[User02], Is.EqualTo(TextInfoPermission.None));
        Assert.That(resource.Texts.First().Chapters.First().Permissions[User01], Is.EqualTo(TextInfoPermission.Read));
        Assert.That(resource.Texts.First().Chapters.First().Permissions[User02], Is.EqualTo(TextInfoPermission.None));
    }

    [Test]
    public async Task IsSourceProject_TrueWhenProjectIsAnAlternateSource()
    {
        var env = new TestEnvironment();
        const string paratextId = "paratext_" + Project01;
        Assert.That(env.Service.IsSourceProject(Project01), Is.False);

        await env.Service.UpdateSettingsAsync(
            User01,
            Project03,
            new SFProjectSettings { AlternateSourceParatextId = paratextId }
        );

        // SUT
        Assert.That(env.Service.IsSourceProject(Project01), Is.True);
    }

    [Test]
    public async Task IsSourceProject_TrueWhenProjectIsAAlternateTrainingSource()
    {
        var env = new TestEnvironment();
        const string paratextId = "paratext_" + Project01;
        Assert.That(env.Service.IsSourceProject(Project01), Is.False);

        await env.Service.UpdateSettingsAsync(
            User01,
            Project03,
            new SFProjectSettings { AlternateTrainingSourceParatextId = paratextId }
        );

        // SUT
        Assert.That(env.Service.IsSourceProject(Project01), Is.True);
    }

    [Test]
    public void IsSourceProject_TrueWhenProjectIsATranslationSource()
    {
        var env = new TestEnvironment();
        Assert.That(env.Service.IsSourceProject(Resource01), Is.True);
        Assert.That(env.Service.IsSourceProject(Project01), Is.False);
        Assert.That(env.Service.IsSourceProject(SourceOnly), Is.True);
        Assert.That(env.Service.IsSourceProject("Bad project"), Is.False);
    }

    [Test]
    public async Task UpdateSettingsAsync_ChangeAlternateSource_CannotUseTargetProject()
    {
        var env = new TestEnvironment();
        const string paratextId = "paratext_" + Project01;

        await env.Service.UpdateSettingsAsync(
            User01,
            Project01,
            new SFProjectSettings { AlternateSourceParatextId = paratextId }
        );

        SFProject project = env.GetProject(Project01);
        Assert.That(project.ParatextId, Is.EqualTo(paratextId));
        Assert.That(project.TranslateConfig.DraftConfig.AlternateSource?.ProjectRef, Is.Null);
        Assert.That(project.TranslateConfig.DraftConfig.AlternateSource?.ParatextId, Is.Null);
        Assert.That(project.TranslateConfig.DraftConfig.AlternateSource?.Name, Is.Null);

        await env.MachineProjectService.DidNotReceive()
            .RemoveProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.MachineProjectService.DidNotReceive()
            .AddProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.SyncService.DidNotReceive().SyncAsync(Arg.Any<SyncConfig>());
    }

    [Test]
    public async Task UpdateSettingsAsync_ChangeAlternateSource_CreatesProject()
    {
        var env = new TestEnvironment();
        const string newProjectParatextId = "changedId";

        // Ensure that the new project does not exist
        Assert.That(
            env.RealtimeService.GetRepository<SFProject>().Query().Any(p => p.ParatextId == newProjectParatextId),
            Is.False
        );

        // SUT
        await env.Service.UpdateSettingsAsync(
            User01,
            Project01,
            new SFProjectSettings { AlternateSourceParatextId = newProjectParatextId }
        );

        SFProject project = env.GetProject(Project01);
        Assert.That(project.TranslateConfig.DraftConfig.AlternateSource?.ProjectRef, Is.Not.Null);
        Assert.That(project.TranslateConfig.DraftConfig.AlternateSource?.ParatextId, Is.EqualTo(newProjectParatextId));
        Assert.That(project.TranslateConfig.DraftConfig.AlternateSource?.Name, Is.EqualTo("NewSource"));

        SFProject alternateSourceProject = env.GetProject(
            project.TranslateConfig.DraftConfig.AlternateSource!.ProjectRef
        );
        Assert.That(alternateSourceProject.ParatextId, Is.EqualTo(newProjectParatextId));
        Assert.That(alternateSourceProject.Name, Is.EqualTo("NewSource"));

        await env.MachineProjectService.DidNotReceive()
            .RemoveProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.MachineProjectService.DidNotReceive()
            .AddProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.SyncService.Received().SyncAsync(Arg.Any<SyncConfig>());
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());

        // Check that the project was created
        Assert.That(
            env.RealtimeService.GetRepository<SFProject>().Query().Any(p => p.ParatextId == newProjectParatextId),
            Is.True
        );
    }

    [Test]
    public async Task UpdateSettingsAsync_ChangeAlternateTrainingSource_CannotUseTargetProject()
    {
        var env = new TestEnvironment();
        const string paratextId = "paratext_" + Project01;

        await env.Service.UpdateSettingsAsync(
            User01,
            Project01,
            new SFProjectSettings { AlternateTrainingSourceParatextId = paratextId }
        );

        SFProject project = env.GetProject(Project01);
        Assert.That(project.ParatextId, Is.EqualTo(paratextId));
        Assert.That(project.TranslateConfig.DraftConfig.AlternateTrainingSource?.ProjectRef, Is.Null);
        Assert.That(project.TranslateConfig.DraftConfig.AlternateTrainingSource?.ParatextId, Is.Null);
        Assert.That(project.TranslateConfig.DraftConfig.AlternateTrainingSource?.Name, Is.Null);

        await env.MachineProjectService.DidNotReceive()
            .RemoveProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.MachineProjectService.DidNotReceive()
            .AddProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.SyncService.DidNotReceive().SyncAsync(Arg.Any<SyncConfig>());
    }

    [Test]
    public async Task UpdateSettingsAsync_ChangeAlternateTrainingSource_CreatesProject()
    {
        var env = new TestEnvironment();
        const string newProjectParatextId = "changedId";

        // Ensure that the new project does not exist
        Assert.That(
            env.RealtimeService.GetRepository<SFProject>().Query().Any(p => p.ParatextId == newProjectParatextId),
            Is.False
        );

        await env.Service.UpdateSettingsAsync(
            User01,
            Project01,
            new SFProjectSettings { AlternateTrainingSourceParatextId = "changedId" }
        );

        SFProject project = env.GetProject(Project01);
        Assert.That(project.TranslateConfig.DraftConfig.AlternateTrainingSource?.ProjectRef, Is.Not.Null);
        Assert.That(project.TranslateConfig.DraftConfig.AlternateTrainingSource?.ParatextId, Is.EqualTo("changedId"));
        Assert.That(project.TranslateConfig.DraftConfig.AlternateTrainingSource?.Name, Is.EqualTo("NewSource"));

        SFProject alternateTrainingSourceProject = env.GetProject(
            project.TranslateConfig.DraftConfig.AlternateTrainingSource!.ProjectRef
        );
        Assert.That(alternateTrainingSourceProject.ParatextId, Is.EqualTo("changedId"));
        Assert.That(alternateTrainingSourceProject.Name, Is.EqualTo("NewSource"));

        await env.MachineProjectService.DidNotReceive()
            .RemoveProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.MachineProjectService.DidNotReceive()
            .AddProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.SyncService.Received().SyncAsync(Arg.Any<SyncConfig>());
        env.BackgroundJobClient.Received(1).Create(Arg.Any<Job>(), Arg.Any<IState>());

        // Check that the project was created
        Assert.That(
            env.RealtimeService.GetRepository<SFProject>().Query().Any(p => p.ParatextId == newProjectParatextId),
            Is.True
        );
    }

    [Test]
    public async Task UpdateSettingsAsync_EnableAlternateSource_NoSync()
    {
        var env = new TestEnvironment();

        await env.Service.UpdateSettingsAsync(
            User01,
            Project01,
            new SFProjectSettings { AlternateSourceEnabled = true }
        );

        SFProject project = env.GetProject(Project01);
        Assert.That(project.TranslateConfig.DraftConfig.AlternateSourceEnabled, Is.True);

        await env.MachineProjectService.DidNotReceive()
            .RemoveProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.MachineProjectService.DidNotReceive()
            .AddProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.SyncService.DidNotReceive().SyncAsync(Arg.Any<SyncConfig>());
    }

    [Test]
    public async Task UpdateSettingsAsync_EnableAlternateTrainingSource_NoSync()
    {
        var env = new TestEnvironment();

        await env.Service.UpdateSettingsAsync(
            User01,
            Project01,
            new SFProjectSettings { AlternateTrainingSourceEnabled = true }
        );

        SFProject project = env.GetProject(Project01);
        Assert.That(project.TranslateConfig.DraftConfig.AlternateTrainingSourceEnabled, Is.True);

        await env.MachineProjectService.DidNotReceive()
            .RemoveProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.MachineProjectService.DidNotReceive()
            .AddProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.SyncService.DidNotReceive().SyncAsync(Arg.Any<SyncConfig>());
    }

    [Test]
    public async Task UpdateSettingsAsync_ChangeSourceProject_RecreateMachineProjectAndSync()
    {
        var env = new TestEnvironment();

        await env.Service.UpdateSettingsAsync(
            User01,
            Project01,
            new SFProjectSettings { SourceParatextId = "changedId", TranslationSuggestionsEnabled = true }
        );

        SFProject project = env.GetProject(Project01);
        Assert.That(project.TranslateConfig.Source.ParatextId, Is.EqualTo("changedId"));
        Assert.That(project.TranslateConfig.Source.Name, Is.EqualTo("NewSource"));

        await env.MachineProjectService.Received()
            .RemoveProjectAsync(User01, Project01, preTranslate: false, CancellationToken.None);
        await env.MachineProjectService.Received()
            .AddProjectAsync(User01, Project01, preTranslate: false, CancellationToken.None);
        await env.SyncService.Received().SyncAsync(Arg.Any<SyncConfig>());
    }

    [Test]
    public async Task UpdateSettingsAsync_SelectSourceProject_NoMachineProjectAndSync()
    {
        var env = new TestEnvironment();
        await env.Service.UpdateSettingsAsync(
            User02,
            Project02,
            new SFProjectSettings { SourceParatextId = "changedId" }
        );

        SFProject project = env.GetProject(Project02);
        Assert.That(project.TranslateConfig.TranslationSuggestionsEnabled, Is.False);
        Assert.That(project.TranslateConfig.Source.ParatextId, Is.EqualTo("changedId"));
        Assert.That(project.TranslateConfig.Source.Name, Is.EqualTo("NewSource"));

        await env.MachineProjectService.DidNotReceive()
            .RemoveProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.MachineProjectService.DidNotReceive()
            .AddProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.SyncService.Received().SyncAsync(Arg.Any<SyncConfig>());
    }

    [Test]
    public async Task UpdateSettingsAsync_EnableTranslate_CreateMachineProjectAndSync()
    {
        var env = new TestEnvironment();
        await env.Service.UpdateSettingsAsync(
            User01,
            Project03,
            new SFProjectSettings { TranslationSuggestionsEnabled = true }
        );

        SFProject project = env.GetProject(Project03);
        Assert.That(project.TranslateConfig.TranslationSuggestionsEnabled, Is.True);
        Assert.That(project.TranslateConfig.Source.Name, Is.EqualTo("Source Only Project"));

        await env.MachineProjectService.DidNotReceive()
            .RemoveProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.MachineProjectService.Received()
            .AddProjectAsync(User01, Project03, preTranslate: false, CancellationToken.None);
        await env.SyncService.Received().SyncAsync(Arg.Any<SyncConfig>());
    }

    [Test]
    public async Task UpdateSettingsAsync_UnsetSourceProject_RemoveMachineProjectAndSync()
    {
        var env = new TestEnvironment();
        await env.Service.UpdateSettingsAsync(
            User01,
            Project01,
            new SFProjectSettings
            {
                SourceParatextId = SFProjectService.ProjectSettingValueUnset,
                TranslationSuggestionsEnabled = false
            }
        );

        SFProject project = env.GetProject(Project01);
        Assert.That(project.TranslateConfig.TranslationSuggestionsEnabled, Is.False);
        Assert.That(project.TranslateConfig.Source, Is.Null);

        await env.MachineProjectService.Received()
            .RemoveProjectAsync(User01, Project01, preTranslate: false, CancellationToken.None);
        await env.MachineProjectService.DidNotReceive()
            .AddProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.SyncService.Received().SyncAsync(Arg.Any<SyncConfig>());
    }

    [Test]
    public async Task UpdateSettingsAsync_EnableChecking_Sync()
    {
        var env = new TestEnvironment();

        await env.Service.UpdateSettingsAsync(User01, Project01, new SFProjectSettings { CheckingEnabled = true });

        SFProject project = env.GetProject(Project01);
        Assert.That(project.CheckingConfig.CheckingEnabled, Is.True);

        await env.MachineProjectService.DidNotReceive()
            .RemoveProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.MachineProjectService.DidNotReceive()
            .AddProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.SyncService.Received().SyncAsync(Arg.Any<SyncConfig>());
    }

    [Test]
    public async Task UpdateSettingsAsync_EnableSharing_NoSync()
    {
        var env = new TestEnvironment();

        await env.Service.UpdateSettingsAsync(User01, Project01, new SFProjectSettings { CheckingShareEnabled = true });

        SFProject project = env.GetProject(Project01);
        Assert.That(project.CheckingConfig.ShareEnabled, Is.True);

        await env.MachineProjectService.DidNotReceive()
            .RemoveProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.MachineProjectService.DidNotReceive()
            .AddProjectAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<bool>(), Arg.Any<CancellationToken>());
        await env.SyncService.DidNotReceive().SyncAsync(Arg.Any<SyncConfig>());
    }

    [Test]
    public async Task DeleteAsync()
    {
        var env = new TestEnvironment();
        string ptProjectDir = Path.Combine("xforge", "sync", "paratext_" + Project01);
        env.FileSystemService.DirectoryExists(ptProjectDir).Returns(true);
        Assert.That(env.ProjectSecrets.Contains(Project01), Is.True, "setup");
        // SUT
        await env.Service.DeleteProjectAsync(User01, Project01);

        Assert.That(env.ContainsProject(Project01), Is.False);
        User user = env.GetUser(User01);
        Assert.That(user.Sites[SiteId].Projects, Does.Not.Contain(Project01));
        await env.MachineProjectService.Received()
            .RemoveProjectAsync(User01, Project01, preTranslate: false, CancellationToken.None);
        env.FileSystemService.Received().DeleteDirectory(ptProjectDir);
        Assert.That(env.ProjectSecrets.Contains(Project01), Is.False);

        ptProjectDir = Path.Combine("xforge", "sync", "pt_source_no_suggestions");
        env.FileSystemService.DirectoryExists(ptProjectDir).Returns(true);
        Assert.That(env.GetProject(Project03).TranslateConfig.Source, Is.Not.Null);
        await env.Service.DeleteProjectAsync(User01, SourceOnly);

        await env.SyncService.Received().CancelSyncAsync(User01, SourceOnly);
        await env.MachineProjectService.Received()
            .RemoveProjectAsync(User01, SourceOnly, preTranslate: false, CancellationToken.None);
        env.FileSystemService.Received().DeleteDirectory(ptProjectDir);
        Assert.That(env.ContainsProject(SourceOnly), Is.False);
        Assert.That(env.GetUser(User01).Sites[SiteId].Projects, Does.Not.Contain(SourceOnly));
        Assert.That(env.GetProject(Project02).TranslateConfig.Source, Is.Null);
    }

    [Test]
    public async Task CreateProjectAsync_NotExisting_Created()
    {
        var env = new TestEnvironment();
        int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
        env.ParatextService.TryGetProjectRoleAsync(
            Arg.Any<UserSecret>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>()
        )
            .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Administrator)));
        // SUT
        string sfProjectId = await env.Service.CreateProjectAsync(
            User01,
            new SFProjectCreateSettings() { ParatextId = "ptProject123" }
        );
        Assert.That(env.ContainsProject(sfProjectId), Is.True);
        Assert.That(
            env.RealtimeService.GetRepository<SFProject>().Query().Count(),
            Is.EqualTo(projectCount + 1),
            "should have increased"
        );
        SFProject newProject = env.RealtimeService.GetRepository<SFProject>().Get(sfProjectId);
        Assert.That(newProject.CheckingConfig.ShareEnabled, Is.False, "Should default to not shared (SF-1142)");
    }

    [Test]
    public async Task CreateProjectAsync_Target_Created_Before_Source()
    {
        var env = new TestEnvironment();
        int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
        env.ParatextService.TryGetProjectRoleAsync(
            Arg.Any<UserSecret>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>()
        )
            .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Administrator)));
        env.ParatextService.GetResourcePermissionAsync(Arg.Any<string>(), User01, Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(TextInfoPermission.Read));
        // SUT
        string sfProjectId = await env.Service.CreateProjectAsync(
            User01,
            new SFProjectCreateSettings()
            {
                ParatextId = "ptProject123",
                SourceParatextId = "resource_project",
                TranslationSuggestionsEnabled = true,
            }
        );
        Assert.That(env.ContainsProject(sfProjectId), Is.True);
        Assert.That(
            env.RealtimeService.GetRepository<SFProject>().Query().Count(),
            Is.EqualTo(projectCount + 2),
            "should have increased"
        );

        // The source should have a later ID than the target in the project repository
        var projects = env.RealtimeService.GetRepository<SFProject>()
            .Query()
            .Where(p => p.ParatextId == "ptProject123" || p.ParatextId == "resource_project")
            .OrderBy(p => p.Id);
        Assert.That(projects.First().ParatextId, Is.EqualTo("ptProject123"), "target has the first id");
        Assert.That(projects.Last().ParatextId, Is.EqualTo("resource_project"), "source has the last id");

        // The source should appear after the target in the user's project array
        User user = env.GetUser(User01);
        Assert.That(user.Sites[SiteId].Projects.Skip(3).First(), Is.EqualTo(projects.First().Id), "target is first");
        Assert.That(user.Sites[SiteId].Projects.Last(), Is.EqualTo(projects.Last().Id), "source is last");
    }

    [Test]
    public void CreateProjectAsync_AlreadyExists_Error()
    {
        var env = new TestEnvironment();
        int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
        env.ParatextService.TryGetProjectRoleAsync(
            Arg.Any<UserSecret>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>()
        )
            .Returns(Task.FromResult(Attempt.Success(SFProjectRole.Administrator)));
        SFProject existingSfProject = env.GetProject(Project01);
        // SUT
        InvalidOperationException thrown = Assert.ThrowsAsync<InvalidOperationException>(
            () =>
                env.Service.CreateProjectAsync(
                    User01,
                    new SFProjectCreateSettings() { ParatextId = existingSfProject.ParatextId }
                )
        );
        Assert.That(thrown.Message, Does.Contain(SFProjectService.ErrorAlreadyConnectedKey));
        Assert.That(
            env.RealtimeService.GetRepository<SFProject>().Query().Count(),
            Is.EqualTo(projectCount),
            "should not have changed"
        );
    }

    [Test]
    public async Task CreateProjectAsync_RequestingPTUserHasPTPermissions()
    {
        // If a user connects a project that was not yet in SF via the Connect Project page, project text
        // permissions should be set so that the connecting user has permissions set that are from PT.

        var env = new TestEnvironment();
        string targetProjectPTId = PTProjectIdNotYetInSF;
        string sourceProjectPTId = Resource01PTId;
        SFProject resource = env.GetProject(Resource01);

        Assert.That(env.UserSecrets.Contains(User03), Is.True, "setup. PT user should have user secrets.");
        User user = env.GetUser(User03);
        Assert.That(user.ParatextId, Is.Not.Null, "setup. PT user should have a PT User ID.");
        Assert.That(env.ContainsProject(targetProjectPTId), Is.False, "setup. No such SF should exist yet.");

        Assert.That(
            resource.UserRoles.ContainsKey(User03),
            Is.False,
            "setup. User should not already be on the project, for purposes of testing that they are later."
        );
        Assert.That(resource.Texts.First().Permissions.ContainsKey(User03), Is.False, "setup");
        Assert.That(resource.Texts.First().Chapters.First().Permissions.ContainsKey(User03), Is.False, "setup");

        string userRoleOnPTProject = SFProjectRole.Administrator;
        env.ParatextService.TryGetProjectRoleAsync(
            Arg.Any<UserSecret>(),
            Arg.Any<string>(),
            Arg.Any<CancellationToken>()
        )
            .Returns(Task.FromResult(Attempt.Success(userRoleOnPTProject)));
        string userDBLPermissionForResource = TextInfoPermission.Read;
        env.ParatextService.GetResourcePermissionAsync(Arg.Any<string>(), User03, Arg.Any<CancellationToken>())
            .Returns<Task<string>>(Task.FromResult(userDBLPermissionForResource));

        var bookList = new List<int>() { 40, 41 };
        env.ParatextService.GetBookList(Arg.Any<UserSecret>(), Arg.Any<string>()).Returns(bookList);

        // PT will answer with these permissions.
        // Note that in the case of checking permissions for the target project, SF won't actually get to the
        // point where it queries for the PT permissions. But leaving these settings here in case
        // UpdatePermissionsAsync() is later modified and it starts doing that.
        var ptBookPermissions = new Dictionary<string, string>()
        {
            { User03, TextInfoPermission.Read },
            { User01, TextInfoPermission.Read },
        };
        var ptChapterPermissions = new Dictionary<string, string>()
        {
            { User03, TextInfoPermission.Write },
            { User01, TextInfoPermission.Read },
        };
        var ptSourcePermissions = new Dictionary<string, string>()
        {
            { User03, userDBLPermissionForResource },
            { User01, TextInfoPermission.None },
        };
        const int bookValueToIndicateWholeResource = 0;
        const int chapterValueToIndicateWholeBook = 0;
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == targetProjectPTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptBookPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == targetProjectPTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            Arg.Any<int>(),
            Arg.Is<int>((int arg) => arg > 0)
        )
            .Returns(Task.FromResult(ptChapterPermissions));
        env.ParatextService.GetPermissionsAsync(
            Arg.Any<UserSecret>(),
            Arg.Is<SFProject>((SFProject project) => project.ParatextId == sourceProjectPTId),
            Arg.Any<IReadOnlyDictionary<string, string>>(),
            bookValueToIndicateWholeResource,
            chapterValueToIndicateWholeBook
        )
            .Returns(Task.FromResult(ptSourcePermissions));

        resource = env.GetProject(Resource01);
        Assert.That(
            resource.Texts.First().Permissions.Count,
            Is.EqualTo(0),
            "setup. User should not have permissions on resource yet."
        );
        Assert.That(resource.Texts.First().Chapters.First().Permissions.Count, Is.EqualTo(0), "setup");

        // SUT
        string sfProjectId = await env.Service.CreateProjectAsync(
            User03,
            new SFProjectCreateSettings()
            {
                ParatextId = targetProjectPTId,
                SourceParatextId = sourceProjectPTId,
                TranslationSuggestionsEnabled = true,
            }
        );

        SFProject project = env.GetProject(sfProjectId);
        Assert.That(
            project.UserRoles.TryGetValue(User03, out string userRole),
            Is.True,
            "user should be added to project"
        );
        Assert.That(userRole, Is.EqualTo(userRoleOnPTProject));
        user = env.GetUser(User03);
        Assert.That(user.Sites[SiteId].Projects, Contains.Item(sfProjectId), "user not added to project correctly");

        // Initially connecting a project should have called Sync, or SF is not going to fetch books and set
        // permissions on them.
        await env.SyncService.Received()
            .SyncAsync(Arg.Is<SyncConfig>(s => s.ProjectId == sfProjectId && s.TrainEngine && s.UserId == User03));

        // Don't check that permissions were added to the target project, because we mock the Sync functionality.
        // But we can show that source resource permissions were set:

        resource = env.GetProject(Resource01);
        Assert.That(resource.Texts.First().Permissions[User03], Is.EqualTo(userDBLPermissionForResource));
        Assert.That(
            resource.Texts.First().Chapters.First().Permissions[User03],
            Is.EqualTo(userDBLPermissionForResource)
        );
        Assert.That(
            resource.UserRoles.TryGetValue(User03, out string resourceUserRole),
            Is.True,
            "user should have been added to resource"
        );
        Assert.That(resourceUserRole, Is.EqualTo(SFProjectRole.PTObserver), "user role not set correctly on resource");
        Assert.That(user.Sites[SiteId].Projects, Contains.Item(Resource01), "user not added to resource correctly");
    }

    [Test]
    public async Task CreateResourceProjectAsync_NotExisting_Created()
    {
        var env = new TestEnvironment();
        int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
        // SUT
        string sfProjectId = await env.Service.CreateResourceProjectAsync(User01, "resource_project");
        Assert.That(env.ContainsProject(sfProjectId), Is.True);
        Assert.That(
            env.RealtimeService.GetRepository<SFProject>().Query().Count(),
            Is.EqualTo(projectCount + 1),
            "should have increased"
        );
    }

    [Test]
    public void CreateResourceProjectAsync_AlreadyExists_Error()
    {
        var env = new TestEnvironment();
        int projectCount = env.RealtimeService.GetRepository<SFProject>().Query().Count();
        SFProject existingSfProject = env.GetProject(Resource01);
        // SUT
        InvalidOperationException thrown = Assert.ThrowsAsync<InvalidOperationException>(
            () => env.Service.CreateResourceProjectAsync(User01, existingSfProject.ParatextId)
        );
        Assert.That(thrown.Message, Does.Contain(SFProjectService.ErrorAlreadyConnectedKey));
        Assert.That(
            env.RealtimeService.GetRepository<SFProject>().Query().Count(),
            Is.EqualTo(projectCount),
            "should not have changed"
        );
    }

    [Test]
    public async Task AddUserToResourceProjectAsync_UserResourcePermission()
    {
        var env = new TestEnvironment();
        env.ParatextService.GetResourcePermissionAsync(Arg.Any<string>(), User01, Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(TextInfoPermission.Read));

        User user = env.GetUser(User01);
        Assert.That(user.Sites[SiteId].Projects.Contains(Resource01), Is.False, "setup");

        await env.Service.AddUserAsync(User01, Resource01, null);

        user = env.GetUser(User01);
        Assert.That(user.Sites[SiteId].Projects.Contains(Resource01), Is.True, "User can access resource");
    }

    [Test]
    public void AddUserToResourceProjectAsync_UserResourceNoPermission()
    {
        var env = new TestEnvironment();
        env.ParatextService.GetResourcePermissionAsync(Arg.Any<string>(), User01, Arg.Any<CancellationToken>())
            .Returns(Task.FromResult(TextInfoPermission.None));

        User user = env.GetUser(User01);
        Assert.That(user.Sites[SiteId].Projects.Contains(Resource01), Is.False, "setup");

        Assert.ThrowsAsync<ForbiddenException>(() => env.Service.AddUserAsync(User01, Resource01, null));

        user = env.GetUser(User01);
        Assert.That(user.Sites[SiteId].Projects.Contains(Resource01), Is.False, "user cannot access resource");
    }

    [Test]
    public void CancelSyncAsync_AdministratorsCanCancelSync()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.DoesNotThrowAsync(() => env.Service.CancelSyncAsync(User01, Project01));
    }

    [Test]
    public void CancelSyncAsync_TranslatorsCanCancelSync()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.DoesNotThrowAsync(() => env.Service.CancelSyncAsync(User05, Project01));
    }

    [Test]
    public void CancelSyncAsync_ObserversCannotCancelSync()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() => env.Service.CancelSyncAsync(User02, Project01));
    }

    [Test]
    public void CancelSyncAsync_UsersNotInProjectCannotCancelSync()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() => env.Service.CancelSyncAsync(User03, Project01));
    }

    [Test]
    public void SyncAsync_AdministratorsCanSync()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.DoesNotThrowAsync(() => env.Service.SyncAsync(User01, Project01));
    }

    [Test]
    public void SyncAsync_TranslatorsCanSync()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.DoesNotThrowAsync(() => env.Service.SyncAsync(User05, Project01));
    }

    [Test]
    public void SyncAsync_ObserversCannotSync()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(() => env.Service.SyncAsync(User02, Project01));
    }

    [Test]
    public async Task EnsureWritingSystemTagIsSetAsync_DoesNotUpdateIfNoChanges()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        await env.Service.EnsureWritingSystemTagIsSetAsync(User01, Project01);

        // If the writing system tags are updated, the projects must be retrieved
        // We check that this is not called, to ensure that it was not updated
        await env.ParatextService.DidNotReceive().GetProjectsAsync(Arg.Any<UserSecret>());
    }

    [Test]
    public async Task EnsureWritingSystemTagIsSetAsync_DoesNotUpdateIfNotInRegistry()
    {
        // Setup
        var env = new TestEnvironment();
        IReadOnlyList<ParatextProject> ptProjects = Array.Empty<ParatextProject>();
        env.ParatextService.GetProjectsAsync(Arg.Any<UserSecret>()).Returns(Task.FromResult(ptProjects));

        // SUT
        await env.Service.EnsureWritingSystemTagIsSetAsync(User01, Project04);

        // Ensure that our mock GetProjectsAsync created above is called
        await env.ParatextService.Received(1).GetProjectsAsync(Arg.Any<UserSecret>());

        Assert.IsNull(env.GetProject(Project04).WritingSystem.Tag);
        Assert.IsNull(env.GetProject(Project04).TranslateConfig.Source.WritingSystem.Tag);
    }

    [Test]
    public async Task EnsureWritingSystemTagIsSetAsync_UpdatesTagsIfMissing()
    {
        // Setup
        const string languageTag01 = "languageTag01";
        const string languageTag02 = "languageTag02";
        var env = new TestEnvironment();
        IReadOnlyList<ParatextProject> ptProjects = new[]
        {
            new ParatextProject { ProjectId = Project04, LanguageTag = languageTag01 },
            new ParatextProject
            {
                ParatextId = env.GetProject(Project04).TranslateConfig.Source.ParatextId,
                LanguageTag = languageTag02,
            },
        };
        env.ParatextService.GetProjectsAsync(Arg.Any<UserSecret>()).Returns(Task.FromResult(ptProjects));

        // SUT
        await env.Service.EnsureWritingSystemTagIsSetAsync(User01, Project04);

        // Ensure that our mock GetProjectsAsync created above is called
        await env.ParatextService.Received(1).GetProjectsAsync(Arg.Any<UserSecret>());

        Assert.AreEqual(languageTag01, env.GetProject(Project04).WritingSystem.Tag);
        Assert.AreEqual(languageTag02, env.GetProject(Project04).TranslateConfig.Source.WritingSystem.Tag);
    }

    [Test]
    public async Task CreateAudioTimingData_CreatesTextAudioDoc()
    {
        var env = new TestEnvironment();
        const int book = 40;
        const int chapter = 1;
        var timingData = new List<AudioTiming>();
        const string audioUrl = "http://example.com/audio.mp3";
        string id = TextAudio.GetDocId(Project01, book, chapter);

        // Verify that the audio document does not exist in the project
        var project = env.GetProject(Project01);
        Assert.IsNull(project.Texts.Single(t => t.BookNum == book).Chapters.Single(c => c.Number == chapter).HasAudio);
        Assert.IsFalse(env.RealtimeService.GetRepository<TextAudio>().Contains(id));

        // SUT
        await env.Service.CreateAudioTimingData(User01, Project01, book, chapter, timingData, audioUrl);

        // Verify TextAudio document
        TextAudio textAudio = env.RealtimeService.GetRepository<TextAudio>().Get(id);
        Assert.AreEqual(User01, textAudio.OwnerRef);
        Assert.AreEqual(Project01, textAudio.ProjectRef);
        Assert.AreEqual(id, textAudio.DataId);
        Assert.AreEqual("audio/mp3", textAudio.MimeType);
        Assert.AreEqual(audioUrl, textAudio.AudioUrl);
        Assert.AreEqual(timingData, textAudio.Timings);

        // Verify project document
        project = env.GetProject(Project01);
        Assert.IsTrue(project.Texts.Single(t => t.BookNum == book).Chapters.Single(c => c.Number == chapter).HasAudio);
    }

    [Test]
    public void CreateAudioTimingData_ProjectMustExist()
    {
        var env = new TestEnvironment();
        const int book = 40;
        const int chapter = 1;
        var timingData = new List<AudioTiming>();
        const string audioUrl = "http://example.com/audio.mp3";

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.CreateAudioTimingData(User01, "invalid_project", book, chapter, timingData, audioUrl)
        );
    }

    [Test]
    public void CreateAudioTimingData_TranslatorsCannotUpload()
    {
        var env = new TestEnvironment();
        const int book = 40;
        const int chapter = 1;
        var timingData = new List<AudioTiming>();
        const string audioUrl = "http://example.com/audio.mp3";

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.CreateAudioTimingData(User05, Project01, book, chapter, timingData, audioUrl)
        );
    }

    [Test]
    public void CreateAudioTimingData_CanUploadWithPermission()
    {
        var env = new TestEnvironment();
        const int book = 40;
        const int chapter = 1;
        var timingData = new List<AudioTiming>();
        const string audioUrl = "http://example.com/audio.mp3";

        // SUT
        Assert.DoesNotThrowAsync(
            () => env.Service.CreateAudioTimingData(User03, Project01, book, chapter, timingData, audioUrl)
        );
    }

    [Test]
    public async Task CreateAudioTimingData_UpdatesTextAudioDoc()
    {
        var env = new TestEnvironment();
        const int book = 41;
        const int chapter = 1;
        var timingData = new List<AudioTiming>
        {
            new AudioTiming
            {
                From = 0.1,
                TextRef = "MRK 1:1",
                To = 1.1,
            },
            new AudioTiming
            {
                From = 1.1,
                TextRef = "MRK 1:2",
                To = 2.2,
            },
        };
        const string audioUrl = "http://example.com/audio.mp3";
        string id = TextAudio.GetDocId(Project01, book, chapter);

        // Verify that the audio document exists in the project
        var project = env.GetProject(Project01);
        Assert.IsTrue(project.Texts.Single(t => t.BookNum == book).Chapters.Single(c => c.Number == chapter).HasAudio);
        Assert.IsTrue(env.RealtimeService.GetRepository<TextAudio>().Contains(id));

        // SUT
        await env.Service.CreateAudioTimingData(User01, Project01, book, chapter, timingData, audioUrl);

        // Verify updated TextAudio document
        TextAudio textAudio = env.RealtimeService.GetRepository<TextAudio>().Get(id);
        Assert.AreEqual("audio/mp3", textAudio.MimeType);
        Assert.AreEqual(audioUrl, textAudio.AudioUrl);
        Assert.AreEqual(timingData.Count, textAudio.Timings.Count);

        // Verify project document
        project = env.GetProject(Project01);
        Assert.IsTrue(project.Texts.Single(t => t.BookNum == book).Chapters.Single(c => c.Number == chapter).HasAudio);
    }

    [Test]
    public async Task DeleteAudioTimingData_DeletesTextAudioDoc()
    {
        var env = new TestEnvironment();
        const int book = 41;
        const int chapter = 1;
        string id = TextAudio.GetDocId(Project01, book, chapter);

        // Verify that the audio document exists in the project
        var project = env.GetProject(Project01);
        Assert.IsTrue(project.Texts.Single(t => t.BookNum == book).Chapters.Single(c => c.Number == chapter).HasAudio);
        Assert.IsTrue(env.RealtimeService.GetRepository<TextAudio>().Contains(id));

        // SUT
        await env.Service.DeleteAudioTimingData(User01, Project01, book, chapter);

        // Verify deletion of TextAudio document
        Assert.IsFalse(env.RealtimeService.GetRepository<TextAudio>().Contains(id));

        // Verify project document
        project = env.GetProject(Project01);
        Assert.IsFalse(project.Texts.Single(t => t.BookNum == book).Chapters.Single(c => c.Number == chapter).HasAudio);
    }

    [Test]
    public void DeleteAudioTimingData_ProjectMustExist()
    {
        var env = new TestEnvironment();
        const int book = 40;
        const int chapter = 1;

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.DeleteAudioTimingData(User01, "invalid_project", book, chapter)
        );
    }

    [Test]
    public void DeleteAudioTimingData_TextAudioDocMustExist()
    {
        var env = new TestEnvironment();
        const int book = 40;
        const int chapter = 1;

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () => env.Service.DeleteAudioTimingData(User01, Project01, book, chapter)
        );
    }

    [Test]
    public void DeleteAudioTimingData_TranslatorsCannotDelete()
    {
        var env = new TestEnvironment();
        const int book = 40;
        const int chapter = 1;

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.DeleteAudioTimingData(User05, Project01, book, chapter)
        );
    }

    [Test]
    public void SetPreTranslate_RequiresSysAdmin()
    {
        var env = new TestEnvironment();
        // SUT 1
        Assert.ThrowsAsync<ForbiddenException>(
            async () =>
                await env.Service.SetPreTranslateAsync(User03, new string[] { SystemRole.User }, Project01, false)
        );
        // SUT 2
        Assert.ThrowsAsync<ForbiddenException>(
            async () =>
                await env.Service.SetPreTranslateAsync(User03, new string[] { SystemRole.None }, Project01, false)
        );
        // SUT 3
        Assert.DoesNotThrowAsync(
            async () =>
                await env.Service.SetPreTranslateAsync(
                    User03,
                    new string[] { SystemRole.SystemAdmin },
                    Project01,
                    false
                )
        );
    }

    [Test]
    public async Task SetPreTranslate_Success()
    {
        var env = new TestEnvironment();

        Assert.That(env.GetProject(Project02).TranslateConfig.PreTranslate, Is.EqualTo(false));
        // SUT 1
        await env.Service.SetPreTranslateAsync(User01, new string[] { SystemRole.SystemAdmin }, Project02, true);
        Assert.That(env.GetProject(Project02).TranslateConfig.PreTranslate, Is.EqualTo(true));

        Assert.That(env.GetProject(Project01).TranslateConfig.PreTranslate, Is.EqualTo(true));
        // SUT 2
        await env.Service.SetPreTranslateAsync(User01, new string[] { SystemRole.SystemAdmin }, Project01, false);
        Assert.That(env.GetProject(Project01).TranslateConfig.PreTranslate, Is.EqualTo(false));
    }

    [Test]
    public async Task CreateAudioTimingData_CanDeleteWithPermission()
    {
        var env = new TestEnvironment();
        const int book = 40;
        const int chapter = 1;
        var timingData = new List<AudioTiming>();
        const string audioUrl = "http://example.com/audio.mp3";

        await env.Service.CreateAudioTimingData(User03, Project01, book, chapter, timingData, audioUrl);

        // SUT
        Assert.DoesNotThrowAsync(() => env.Service.DeleteAudioTimingData(User03, Project01, book, chapter));
    }

    [Test]
    public async Task SetServalConfigAsync_AllowsNull()
    {
        var env = new TestEnvironment();

        // SUT
        await env.Service.SetServalConfigAsync(
            User01,
            new string[] { SystemRole.SystemAdmin },
            Project01,
            servalConfig: null
        );

        // Verify project document
        SFProject project = env.GetProject(Project01);
        Assert.IsNull(project.TranslateConfig.DraftConfig!.ServalConfig);
    }

    [Test]
    public void SetServalConfigAsync_BlocksInvalidJson()
    {
        var env = new TestEnvironment();
        const string servalConfig = "this_is_not_json";

        // SUT
        Assert.ThrowsAsync<JsonReaderException>(
            () =>
                env.Service.SetServalConfigAsync(
                    User01,
                    new string[] { SystemRole.SystemAdmin },
                    Project01,
                    servalConfig
                )
        );
    }

    [Test]
    public async Task SetServalConfigAsync_ChangesWhiteSpaceToNull()
    {
        var env = new TestEnvironment();
        const string servalConfig = "  ";

        // SUT
        await env.Service.SetServalConfigAsync(
            User01,
            new string[] { SystemRole.SystemAdmin },
            Project01,
            servalConfig
        );

        // Verify project document
        SFProject project = env.GetProject(Project01);
        Assert.IsNull(project.TranslateConfig.DraftConfig!.ServalConfig);
    }

    [Test]
    public void SetServalConfigAsync_ProjectMustExist()
    {
        var env = new TestEnvironment();
        const string servalConfig = "{ config: true }";

        // SUT
        Assert.ThrowsAsync<DataNotFoundException>(
            () =>
                env.Service.SetServalConfigAsync(
                    User01,
                    new string[] { SystemRole.SystemAdmin },
                    "invalid_project",
                    servalConfig
                )
        );
    }

    [Test]
    public async Task SetServalConfigAsync_UpdatesProjectDocument()
    {
        var env = new TestEnvironment();
        const string servalConfig = "{ updatedConfig: true }";

        // Verify project document
        SFProject project = env.GetProject(Project01);
        Assert.IsNotNull(project.TranslateConfig.DraftConfig);

        // SUT
        await env.Service.SetServalConfigAsync(
            User01,
            new string[] { SystemRole.SystemAdmin },
            Project01,
            servalConfig
        );

        // Verify project document
        project = env.GetProject(Project01);
        Assert.AreEqual(project.TranslateConfig.DraftConfig!.ServalConfig, servalConfig);
    }

    [Test]
    public void SetServalConfigAsync_UserMustBeSystemAdmin()
    {
        var env = new TestEnvironment();
        const string servalConfig = "{ config: true }";

        // SUT
        Assert.ThrowsAsync<ForbiddenException>(
            () => env.Service.SetServalConfigAsync(User01, new string[] { SystemRole.User }, Project01, servalConfig)
        );
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            RealtimeService = new SFMemoryRealtimeService();
            RealtimeService.AddRepository(
                "users",
                OTType.Json0,
                new MemoryRepository<User>(
                    new[]
                    {
                        new User
                        {
                            Id = User01,
                            Email = "user01@example.com",
                            ParatextId = "pt-user01",
                            Roles = new List<string> { SystemRole.User },
                            Sites = new Dictionary<string, Site>
                            {
                                {
                                    SiteId,
                                    new Site { Projects = { Project01, Project03, SourceOnly } }
                                },
                            },
                        },
                        new User
                        {
                            Id = User02,
                            Email = "user02@example.com",
                            ParatextId = "pt-user02",
                            Roles = new List<string> { SystemRole.User },
                            Sites = new Dictionary<string, Site>
                            {
                                {
                                    SiteId,
                                    new Site { Projects = { Project01, Project02, Project03, Project04, Project06 } }
                                },
                            },
                        },
                        new User
                        {
                            Id = User03,
                            Email = "user03@example.com",
                            ParatextId = "pt-user03",
                            Roles = new List<string> { SystemRole.User },
                            Sites = new Dictionary<string, Site> { { SiteId, new Site() } },
                        },
                        new User
                        {
                            Id = User04,
                            Email = "user04@example.com",
                            Roles = new List<string> { SystemRole.SystemAdmin },
                            Sites = new Dictionary<string, Site> { { SiteId, new Site() } },
                        },
                        new User
                        {
                            Id = LinkExpiredUser,
                            Email = "expired@example.com",
                            Roles = new List<string> { SystemRole.User },
                            Sites = new Dictionary<string, Site> { { SiteId, new Site() } },
                        },
                        new User
                        {
                            Id = User05,
                            Email = "user05@example.com",
                            ParatextId = "pt-user05",
                            Roles = new List<string> { SystemRole.User },
                            Sites = new Dictionary<string, Site>
                            {
                                {
                                    SiteId,
                                    new Site { Projects = { Project01 } }
                                },
                            },
                        },
                        new User
                        {
                            Id = User06,
                            Email = "user06@example.com",
                            Roles = new List<string> { SystemRole.User },
                            Sites = new Dictionary<string, Site>
                            {
                                {
                                    SiteId,
                                    new Site { Projects = { Project01 } }
                                },
                            },
                        },
                        new User
                        {
                            Id = User07,
                            Email = "user07@example.com",
                            Roles = new List<string> { SystemRole.SystemAdmin },
                            Sites = new Dictionary<string, Site>
                            {
                                {
                                    SiteId,
                                    new Site { Projects = { Project06 } }
                                },
                            },
                        },
                    }
                )
            );
            RealtimeService.AddRepository(
                "sf_projects",
                OTType.Json0,
                new MemoryRepository<SFProject>(
                    new[]
                    {
                        new SFProject
                        {
                            Id = Project01,
                            ParatextId = "paratext_" + Project01,
                            Name = "project01",
                            ShortName = "P01",
                            TranslateConfig = new TranslateConfig
                            {
                                PreTranslate = true,
                                TranslationSuggestionsEnabled = true,
                                ShareEnabled = true,
                                Source = new TranslateSource
                                {
                                    ProjectRef = Resource01,
                                    ParatextId = Resource01PTId,
                                    Name = "resource project",
                                    ShortName = "RES",
                                    WritingSystem = new WritingSystem { Tag = "qaa" }
                                },
                                DraftConfig = new DraftConfig { ServalConfig = "{ existingConfig: true }", },
                            },
                            CheckingConfig = new CheckingConfig { CheckingEnabled = true, ShareEnabled = false },
                            UserRoles = new Dictionary<string, string>
                            {
                                { User01, SFProjectRole.Administrator },
                                { User02, SFProjectRole.CommunityChecker },
                                { User05, SFProjectRole.Translator },
                                { User06, SFProjectRole.Viewer }
                            },
                            UserPermissions = new Dictionary<string, string[]>
                            {
                                { User03, new[] { "text_audio.create", "text_audio.delete" } },
                                { User05, Array.Empty<string>() }
                            },
                            Texts =
                            {
                                new TextInfo
                                {
                                    BookNum = 40,
                                    Chapters =
                                    {
                                        new Chapter
                                        {
                                            Number = 1,
                                            LastVerse = 3,
                                            IsValid = true,
                                            Permissions = { }
                                        }
                                    }
                                },
                                new TextInfo
                                {
                                    BookNum = 41,
                                    Chapters =
                                    {
                                        new Chapter
                                        {
                                            Number = 1,
                                            LastVerse = 3,
                                            IsValid = true,
                                            Permissions = { },
                                            HasAudio = true,
                                        },
                                        new Chapter
                                        {
                                            Number = 2,
                                            LastVerse = 3,
                                            IsValid = true,
                                            Permissions = { }
                                        }
                                    }
                                }
                            },
                            WritingSystem = new WritingSystem { Tag = "qaa" },
                        },
                        new SFProject
                        {
                            Id = Project02,
                            Name = "project02",
                            ShortName = "P02",
                            ParatextId = "paratext_" + Project02,
                            CheckingConfig = new CheckingConfig { CheckingEnabled = true, ShareEnabled = true, },
                            UserRoles =
                            {
                                { User02, SFProjectRole.Administrator },
                                { User04, SFProjectRole.CommunityChecker }
                            },
                        },
                        new SFProject
                        {
                            Id = Project03,
                            Name = "project03",
                            ShortName = "P03",
                            ParatextId = "paratext_" + Project03,
                            CheckingConfig = new CheckingConfig { CheckingEnabled = true, ShareEnabled = true, },
                            TranslateConfig =
                            {
                                TranslationSuggestionsEnabled = false,
                                Source = new TranslateSource
                                {
                                    ProjectRef = SourceOnly,
                                    ParatextId = "pt_source_no_suggestions",
                                    Name = "Source Only Project"
                                }
                            },
                            UserRoles =
                            {
                                { User01, SFProjectRole.Administrator },
                                { User02, SFProjectRole.CommunityChecker }
                            }
                        },
                        new SFProject
                        {
                            Id = Project04,
                            Name = "project04",
                            ParatextId = "paratext_" + Project04,
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = true,
                                Source = new TranslateSource { ProjectRef = "Invalid_Source", ParatextId = "P04" },
                                ShareEnabled = true,
                            },
                            UserRoles =
                            {
                                { User01, SFProjectRole.CommunityChecker },
                                { User02, SFProjectRole.Administrator }
                            }
                        },
                        new SFProject
                        {
                            Id = Project05,
                            ParatextId = "paratext_" + Project05,
                            Name = "Project05",
                            ShortName = "P05",
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = true,
                                Source = new TranslateSource
                                {
                                    ProjectRef = Resource01,
                                    ParatextId = Resource01PTId,
                                    Name = "resource project",
                                    ShortName = "RES",
                                    WritingSystem = new WritingSystem { Tag = "qaa" }
                                }
                            },
                            CheckingConfig = new CheckingConfig { CheckingEnabled = true, ShareEnabled = false },
                            UserRoles = new Dictionary<string, string>
                            {
                                { User01, SFProjectRole.Administrator },
                                { User02, SFProjectRole.CommunityChecker }
                            },
                            Texts =
                            {
                                new TextInfo
                                {
                                    BookNum = 40,
                                    Chapters =
                                    {
                                        new Chapter
                                        {
                                            Number = 1,
                                            LastVerse = 3,
                                            IsValid = true,
                                            Permissions = { }
                                        }
                                    }
                                },
                                new TextInfo
                                {
                                    BookNum = 41,
                                    Chapters =
                                    {
                                        new Chapter
                                        {
                                            Number = 1,
                                            LastVerse = 3,
                                            IsValid = true,
                                            Permissions = { }
                                        },
                                        new Chapter
                                        {
                                            Number = 2,
                                            LastVerse = 3,
                                            IsValid = true,
                                            Permissions = { }
                                        }
                                    }
                                }
                            }
                        },
                        new SFProject
                        {
                            Id = Project06,
                            Name = "project06",
                            ParatextId = "paratext_" + Project06,
                            CheckingConfig = new CheckingConfig { CheckingEnabled = false, ShareEnabled = true, },
                            UserRoles =
                            {
                                { User01, SFProjectRole.CommunityChecker },
                                { User02, SFProjectRole.CommunityChecker },
                                { User07, SFProjectRole.Administrator }
                            }
                        },
                        new SFProject
                        {
                            Id = Resource01,
                            ParatextId = Resource01PTId,
                            Name = "resource project",
                            ShortName = "RES",
                            Texts =
                            {
                                new TextInfo
                                {
                                    BookNum = 40,
                                    Chapters =
                                    {
                                        new Chapter
                                        {
                                            Number = 1,
                                            LastVerse = 3,
                                            IsValid = true,
                                            Permissions = { }
                                        }
                                    }
                                },
                                new TextInfo
                                {
                                    BookNum = 41,
                                    Chapters =
                                    {
                                        new Chapter
                                        {
                                            Number = 1,
                                            LastVerse = 3,
                                            IsValid = true,
                                            Permissions = { }
                                        },
                                        new Chapter
                                        {
                                            Number = 2,
                                            LastVerse = 3,
                                            IsValid = true,
                                            Permissions = { }
                                        }
                                    }
                                }
                            }
                        },
                        new SFProject
                        {
                            Id = SourceOnly,
                            ParatextId = "pt_source_no_suggestions",
                            Name = "Source Only Project",
                            ShortName = "DSP",
                            UserRoles = { { User01, SFProjectRole.Administrator } }
                        }
                    }
                )
            );
            RealtimeService.AddRepository(
                "sf_project_user_configs",
                OTType.Json0,
                new MemoryRepository<SFProjectUserConfig>(
                    new[]
                    {
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project01, User01) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project01, User02) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project01, User05) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project01, User06) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project02, User02) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project03, User01) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project03, User02) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project04, User01) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project04, User02) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project05, User01) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project05, User02) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project06, User01) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(Project06, User02) },
                        new SFProjectUserConfig { Id = SFProjectUserConfig.GetDocId(SourceOnly, User01) }
                    }
                )
            );
            RealtimeService.AddRepository(
                "text_audio",
                OTType.Json0,
                new MemoryRepository<TextAudio>(
                    new[]
                    {
                        new TextAudio
                        {
                            Id = TextAudio.GetDocId(Project01, 41, 1),
                            OwnerRef = User01,
                            ProjectRef = Project01,
                            DataId = TextAudio.GetDocId(Project01, 41, 1),
                            AudioUrl = "http://example.com/41_1.mp3",
                            MimeType = "audio/mp3",
                            Timings = new List<AudioTiming>
                            {
                                new AudioTiming
                                {
                                    From = 0.0,
                                    TextRef = "MARK 1:1",
                                    To = 1.1,
                                },
                            },
                        },
                    }
                )
            );
            RealtimeService.AddRepository(
                "paratext_note_threads",
                OTType.Json0,
                new MemoryRepository<NoteThread>(
                    new[]
                    {
                        new NoteThread
                        {
                            Id = "project01:dataId01",
                            DataId = "dataId01",
                            ThreadId = "thread01",
                            Notes = new List<Note>()
                            {
                                new Note { DataId = "thread01:PT01", SyncUserRef = "PT01" },
                                new Note { DataId = "thread01:PT01", SyncUserRef = "PT02" }
                            }
                        },
                        new NoteThread
                        {
                            Id = "project01:dataId02",
                            DataId = "dataId02",
                            ThreadId = "thread02",
                            Notes = new List<Note>()
                            {
                                new Note { DataId = "thread02:PT01", SyncUserRef = "PT01" },
                                new Note { DataId = "thread02:PT02", SyncUserRef = "PT02" }
                            }
                        },
                    }
                )
            );
            var siteOptions = Substitute.For<IOptions<SiteOptions>>();
            siteOptions.Value.Returns(
                new SiteOptions
                {
                    Id = SiteId,
                    Name = "xForge",
                    Origin = new Uri("http://localhost"),
                    SiteDir = "xforge"
                }
            );
            var audioService = Substitute.For<IAudioService>();
            EmailService = Substitute.For<IEmailService>();
            var currentTime = DateTime.Now;
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
                                Key = "abcd",
                                ProjectRole = SFProjectRole.CommunityChecker,
                                ShareLinkType = ShareLinkType.Recipient
                            }
                        }
                    },
                    new SFProjectSecret
                    {
                        Id = Project02,
                        ShareKeys = new List<ShareKey>
                        {
                            new ShareKey
                            {
                                Key = "linksharing02",
                                ProjectRole = SFProjectRole.CommunityChecker,
                                ShareLinkType = ShareLinkType.Anyone
                            },
                            new ShareKey
                            {
                                Email = "user03@example.com",
                                Key = "existingkeyuser03",
                                ExpirationTime = currentTime.AddDays(1),
                                ProjectRole = SFProjectRole.CommunityChecker,
                                ShareLinkType = ShareLinkType.Recipient
                            }
                        }
                    },
                    new SFProjectSecret
                    {
                        Id = Project03,
                        ShareKeys = new List<ShareKey>
                        {
                            new ShareKey
                            {
                                Email = "bob@example.com",
                                Key = "key1111",
                                ExpirationTime = currentTime.AddDays(1),
                                ProjectRole = SFProjectRole.CommunityChecker,
                                ShareLinkType = ShareLinkType.Recipient
                            },
                            new ShareKey
                            {
                                Email = "expired@example.com",
                                Key = "keyexp",
                                ExpirationTime = currentTime.AddDays(-1),
                                ProjectRole = SFProjectRole.CommunityChecker,
                                ShareLinkType = ShareLinkType.Recipient
                            },
                            new ShareKey
                            {
                                Email = "user03@example.com",
                                Key = "key1234",
                                ExpirationTime = currentTime.AddDays(1),
                                ProjectRole = SFProjectRole.CommunityChecker,
                                ShareLinkType = ShareLinkType.Recipient
                            },
                            new ShareKey
                            {
                                Email = "bill@example.com",
                                Key = "key2222",
                                ExpirationTime = currentTime.AddDays(1),
                                ProjectRole = SFProjectRole.CommunityChecker,
                                ShareLinkType = ShareLinkType.Recipient
                            }
                        }
                    },
                    new SFProjectSecret
                    {
                        Id = Project04,
                        ShareKeys = new List<ShareKey>
                        {
                            new ShareKey
                            {
                                Key = "linksharing04",
                                ProjectRole = SFProjectRole.Viewer,
                                ShareLinkType = ShareLinkType.Anyone
                            },
                        }
                    },
                    new SFProjectSecret
                    {
                        Id = Project05,
                        ShareKeys = new List<ShareKey>
                        {
                            new ShareKey
                            {
                                Email = "user03@example.com",
                                Key = "key12345",
                                ExpirationTime = currentTime.AddDays(1),
                                ProjectRole = SFProjectRole.CommunityChecker,
                                ShareLinkType = ShareLinkType.Recipient
                            }
                        }
                    },
                    new SFProjectSecret
                    {
                        Id = Project06,
                        ShareKeys = new List<ShareKey>
                        {
                            new ShareKey
                            {
                                Key = "expiredKey",
                                ExpirationTime = currentTime.AddDays(-1),
                                ProjectRole = SFProjectRole.Viewer,
                                ShareLinkType = ShareLinkType.Recipient
                            },
                            new ShareKey
                            {
                                Key = "usedKey",
                                ProjectRole = SFProjectRole.Viewer,
                                ShareLinkType = ShareLinkType.Recipient,
                                RecipientUserId = User02
                            },
                            new ShareKey
                            {
                                Key = "reservedKey",
                                ExpirationTime = currentTime.AddDays(1),
                                ProjectRole = SFProjectRole.Viewer,
                                ShareLinkType = ShareLinkType.Recipient,
                                Reserved = true
                            },
                            new ShareKey
                            {
                                Key = "toBeReservedKey",
                                ProjectRole = SFProjectRole.Commenter,
                                ShareLinkType = ShareLinkType.Recipient,
                            },
                            new ShareKey
                            {
                                Key = "maxUsersReached",
                                ProjectRole = SFProjectRole.Viewer,
                                ShareLinkType = ShareLinkType.Recipient,
                                UsersGenerated = 250
                            },
                        }
                    },
                }
            );
            MachineProjectService = Substitute.For<IMachineProjectService>();
            SyncService = Substitute.For<ISyncService>();
            SyncService.SyncAsync(Arg.Any<SyncConfig>()).Returns(Task.FromResult("jobId"));
            ParatextService = Substitute.For<IParatextService>();
            IReadOnlyList<ParatextProject> ptProjects = new[]
            {
                new ParatextProject
                {
                    ParatextId = "changedId",
                    Name = "NewSource",
                    LanguageTag = "qaa"
                },
                new ParatextProject { ParatextId = GetProject(Project01).ParatextId },
                new ParatextProject { ParatextId = PTProjectIdNotYetInSF },
                new ParatextProject { ParatextId = "ptProject123" }
            };
            ParatextService.GetProjectsAsync(Arg.Any<UserSecret>()).Returns(Task.FromResult(ptProjects));
            IReadOnlyList<ParatextResource> ptResources = new[]
            {
                new ParatextResource
                {
                    ParatextId = "resource_project",
                    Name = "ResourceProject",
                    LanguageTag = "qaa"
                },
                new ParatextResource { ParatextId = GetProject(Resource01).ParatextId }
            };
            ParatextService.GetResourcesAsync(Arg.Any<string>()).Returns(ptResources);
            UserSecrets = new MemoryRepository<UserSecret>(
                new[]
                {
                    new UserSecret { Id = User01 },
                    new UserSecret { Id = User02 },
                    new UserSecret { Id = User03 }
                }
            );
            var translateMetrics = new MemoryRepository<TranslateMetrics>();
            FileSystemService = Substitute.For<IFileSystemService>();
            var options = Options.Create(new LocalizationOptions { ResourcesPath = "Resources" });
            var factory = new ResourceManagerStringLocalizerFactory(options, NullLoggerFactory.Instance);
            Localizer = new StringLocalizer<SharedResource>(factory);
            SecurityService = Substitute.For<ISecurityService>();
            SecurityService.GenerateKey().Returns("1234abc");
            var transceleratorService = Substitute.For<ITransceleratorService>();
            BackgroundJobClient = Substitute.For<IBackgroundJobClient>();

            ParatextService
                .IsResource(Arg.Any<string>())
                .Returns(
                    callInfo => callInfo.ArgAt<string>(0).Length == SFInstallableDblResource.ResourceIdentifierLength
                );

            Service = new SFProjectService(
                RealtimeService,
                siteOptions,
                audioService,
                EmailService,
                ProjectSecrets,
                SecurityService,
                FileSystemService,
                MachineProjectService,
                SyncService,
                ParatextService,
                UserSecrets,
                translateMetrics,
                Localizer,
                transceleratorService,
                BackgroundJobClient
            );
        }

        public SFProjectService Service { get; }
        public IMachineProjectService MachineProjectService { get; }
        public ISyncService SyncService { get; }
        public SFMemoryRealtimeService RealtimeService { get; }
        public IFileSystemService FileSystemService { get; }
        public MemoryRepository<SFProjectSecret> ProjectSecrets { get; }
        public IEmailService EmailService { get; }
        public ISecurityService SecurityService { get; }
        public IParatextService ParatextService { get; }
        public IStringLocalizer<SharedResource> Localizer { get; }
        public MemoryRepository<UserSecret> UserSecrets { get; }
        public IBackgroundJobClient BackgroundJobClient { get; }

        public SFProject GetProject(string id) => RealtimeService.GetRepository<SFProject>().Get(id);

        public bool ContainsProject(string id) => RealtimeService.GetRepository<SFProject>().Contains(id);

        public User GetUser(string id) => RealtimeService.GetRepository<User>().Get(id);
    }
}
