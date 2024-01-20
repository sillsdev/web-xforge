using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Defaults;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

[TestFixture]
public class SFProjectsRpcControllerTests
{
    private const string Project01 = "project01";
    private const string User01 = "user01";
    private const string User02 = "user02";
    private static readonly string[] Roles = { SystemRole.User };

    [Test]
    public async Task InvitedUsers_Available()
    {
        var env = new TestEnvironment();

        // SUT
        var output = ((await env.Controller.InvitedUsers(Project01)) as RpcMethodSuccessResult)!.ReturnObject;
        Assert.IsNotNull(output);
    }

    [Test]
    public async Task UninviteUser_Available()
    {
        var env = new TestEnvironment();
        const string emailAddress = "test@example.com";

        // SUT
        var result = await env.Controller.UninviteUser(Project01, emailAddress);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
    }

    [Test]
    public async Task UpdateRole_Success()
    {
        var env = new TestEnvironment();
        const string projectRole = SFProjectRole.Viewer;

        // SUT
        var result = await env.Controller.UpdateRole(Project01, User02, projectRole);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.UpdateRoleAsync(User01, Roles, Project01, User02, projectRole);
    }

    [Test]
    public async Task UpdateRole_Forbidden()
    {
        var env = new TestEnvironment();
        const string projectRole = SFProjectRole.Viewer;
        env.SFProjectService.UpdateRoleAsync(User01, Roles, Project01, User02, projectRole)
            .Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.UpdateRole(Project01, User02, projectRole);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
    }

    [Test]
    public async Task UpdateRole_NotFound()
    {
        var env = new TestEnvironment();
        const string projectRole = SFProjectRole.Viewer;
        const string errorMessage = "Not Found";
        env.SFProjectService.UpdateRoleAsync(User01, Roles, Project01, User02, projectRole)
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.UpdateRole(Project01, User02, projectRole);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
    }

    [Test]
    public void UpdateRole_UnknownError()
    {
        var env = new TestEnvironment();
        const string projectRole = SFProjectRole.Viewer;
        env.SFProjectService.UpdateRoleAsync(User01, Roles, Project01, User02, projectRole)
            .Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.UpdateRole(Project01, User02, projectRole));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task SetPreTranslate_Success()
    {
        var env = new TestEnvironment();
        const bool preTranslate = true;

        // SUT
        var result = await env.Controller.SetPreTranslate(Project01, preTranslate);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.SetPreTranslateAsync(User01, Roles, Project01, preTranslate);
    }

    [Test]
    public async Task SetPreTranslate_Forbidden()
    {
        var env = new TestEnvironment();
        const bool preTranslate = true;
        env.SFProjectService.SetPreTranslateAsync(User01, Roles, Project01, preTranslate)
            .Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.SetPreTranslate(Project01, preTranslate);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
    }

    [Test]
    public async Task SetPreTranslate_NotFound()
    {
        var env = new TestEnvironment();
        const bool preTranslate = true;
        const string errorMessage = "Not Found";
        env.SFProjectService.SetPreTranslateAsync(User01, Roles, Project01, preTranslate)
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.SetPreTranslate(Project01, preTranslate);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
    }

    [Test]
    public void SetPreTranslate_UnknownError()
    {
        var env = new TestEnvironment();
        const bool preTranslate = true;
        env.SFProjectService.SetPreTranslateAsync(User01, Roles, Project01, preTranslate)
            .Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.SetPreTranslate(Project01, preTranslate));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task SetSyncDisabled_Success()
    {
        var env = new TestEnvironment();
        const bool syncDisabled = true;

        // SUT
        var result = await env.Controller.SetSyncDisabled(Project01, syncDisabled);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.SetSyncDisabledAsync(User01, Roles, Project01, syncDisabled);
    }

    [Test]
    public async Task SetSyncDisabled_Forbidden()
    {
        var env = new TestEnvironment();
        const bool syncDisabled = true;
        env.SFProjectService.SetSyncDisabledAsync(User01, Roles, Project01, syncDisabled)
            .Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.SetSyncDisabled(Project01, syncDisabled);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
    }

    [Test]
    public async Task SetSyncDisabled_NotFound()
    {
        var env = new TestEnvironment();
        const bool syncDisabled = true;
        const string errorMessage = "Not Found";
        env.SFProjectService.SetSyncDisabledAsync(User01, Roles, Project01, syncDisabled)
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.SetSyncDisabled(Project01, syncDisabled);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
    }

    [Test]
    public void SetSyncDisabled_UnknownError()
    {
        var env = new TestEnvironment();
        const bool syncDisabled = true;
        env.SFProjectService.SetSyncDisabledAsync(User01, Roles, Project01, syncDisabled)
            .Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.SetSyncDisabled(Project01, syncDisabled));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task SetServalConfig_Success()
    {
        var env = new TestEnvironment();
        const string servalConfig = "{ updatedConfig: true }";

        // SUT
        var result = await env.Controller.SetServalConfig(Project01, servalConfig);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
    }

    [Test]
    public async Task SetServalConfig_Forbidden()
    {
        var env = new TestEnvironment();
        const string servalConfig = "{ updatedConfig: true }";
        env.SFProjectService.SetServalConfigAsync(User01, Roles, Project01, servalConfig)
            .Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.SetServalConfig(Project01, servalConfig);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
    }

    [Test]
    public async Task SetServalConfig_NotFound()
    {
        var env = new TestEnvironment();
        const string servalConfig = "{ updatedConfig: true }";
        const string errorMessage = "Not Found";
        env.SFProjectService.SetServalConfigAsync(User01, Roles, Project01, servalConfig)
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.SetServalConfig(Project01, servalConfig);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
    }

    [Test]
    public void SetServalConfig_UnknownError()
    {
        var env = new TestEnvironment();
        const string servalConfig = "{ updatedConfig: true }";
        env.SFProjectService.SetServalConfigAsync(User01, Roles, Project01, servalConfig)
            .Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.SetServalConfig(Project01, servalConfig));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task UpdateSettings_Success()
    {
        var env = new TestEnvironment();
        var settings = new SFProjectSettings();

        // SUT
        var result = await env.Controller.UpdateSettings(Project01, settings);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
    }

    [Test]
    public async Task UpdateSettings_Forbidden()
    {
        var env = new TestEnvironment();
        var settings = new SFProjectSettings();
        env.SFProjectService.UpdateSettingsAsync(User01, Project01, settings).Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.UpdateSettings(Project01, settings);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
    }

    [Test]
    public async Task UpdateSettings_NotFound()
    {
        var env = new TestEnvironment();
        var settings = new SFProjectSettings();
        const string errorMessage = "Not Found";
        env.SFProjectService.UpdateSettingsAsync(User01, Project01, settings)
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.UpdateSettings(Project01, settings);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
    }

    [Test]
    public void UpdateSettings_UnknownError()
    {
        var env = new TestEnvironment();
        var settings = new SFProjectSettings
        {
            AlternateSourceParatextId = string.Empty,
            BiblicalTermsEnabled = true,
            CheckingAnswerExport = string.Empty,
            CheckingEnabled = true,
            CheckingShareEnabled = true,
            HideCommunityCheckingText = true,
            SourceParatextId = string.Empty,
            AlternateTrainingSourceEnabled = true,
            AlternateTrainingSourceParatextId = string.Empty,
            TranslateShareEnabled = true,
            TranslationSuggestionsEnabled = true,
            UsersSeeEachOthersResponses = true,
        };
        env.SFProjectService.UpdateSettingsAsync(User01, Project01, settings).Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.UpdateSettings(Project01, settings));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            SFProjectService = Substitute.For<ISFProjectService>();
            var userAccessor = Substitute.For<IUserAccessor>();
            userAccessor.UserId.Returns(User01);
            userAccessor.SystemRoles.Returns(Roles);
            Controller = new SFProjectsRpcController(userAccessor, SFProjectService, ExceptionHandler);
        }

        public IExceptionHandler ExceptionHandler { get; }
        public SFProjectsRpcController Controller { get; }
        public ISFProjectService SFProjectService { get; }
    }
}
