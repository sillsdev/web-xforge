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
    private const string Role = SystemRole.User;

    [Test]
    public async Task InvitedUsers_Available()
    {
        var env = new TestEnvironment();
        var output = ((await env.Controller.InvitedUsers("some-project-id")) as RpcMethodSuccessResult)?.ReturnObject;
        Assert.That(output, Is.Not.Null);
    }

    [Test]
    public async Task UninviteUser_Available()
    {
        var env = new TestEnvironment();
        await env.Controller.UninviteUser("some-project-id", "some-email-address");
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
        env.SFProjectService
            .UpdateSettingsAsync(User01, Project01, settings)
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
            TrainOnEnabled = true,
            TrainOnSourceParatextId = string.Empty,
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
            userAccessor.SystemRole.Returns(Role);
            Controller = new SFProjectsRpcController(userAccessor, SFProjectService, ExceptionHandler);
        }

        public IExceptionHandler ExceptionHandler { get; }
        public SFProjectsRpcController Controller { get; }
        public ISFProjectService SFProjectService { get; }
    }
}
