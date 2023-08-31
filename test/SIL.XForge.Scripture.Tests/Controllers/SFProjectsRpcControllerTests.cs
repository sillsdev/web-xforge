using System.Collections.Generic;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Common;
using EdjCase.JsonRpc.Router.Abstractions;
using EdjCase.JsonRpc.Router.Defaults;
using Microsoft.FeatureManagement;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

[TestFixture]
public class SFProjectsRpcControllerTests
{
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
    public async Task FeatureFlags_ReturnsFeatureFlags()
    {
        var env = new TestEnvironment();
        env.FeatureManager.IsEnabledAsync(FeatureFlags.Serval).Returns(Task.FromResult(true));

        // SUT
        IRpcMethodResult result = await env.Controller.FeatureFlags();

        // Verify result
        Dictionary<string, bool> featureFlags = result.ToRpcResponse(new RpcId()).Result as Dictionary<string, bool>;
        Assert.IsNotNull(featureFlags);
        Assert.IsTrue(featureFlags[FeatureFlags.Serval]);
        Assert.IsFalse(featureFlags[FeatureFlags.WriteNotesToParatext]);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            FeatureManager = Substitute.For<IFeatureManager>();
            FeatureManager.GetFeatureNamesAsync().Returns(GetFeatureFlags());
            SFProjectService = Substitute.For<ISFProjectService>();
            UserAccessor = Substitute.For<IUserAccessor>();
            Controller = new SFProjectsRpcController(UserAccessor, SFProjectService, FeatureManager, ExceptionHandler);
        }

        public IExceptionHandler ExceptionHandler { get; }
        public SFProjectsRpcController Controller { get; }
        public IFeatureManager FeatureManager { get; }
        public ISFProjectService SFProjectService { get; }
        public IUserAccessor UserAccessor { get; }

        private static async IAsyncEnumerable<string> GetFeatureFlags()
        {
            yield return FeatureFlags.Serval;
            yield return FeatureFlags.WriteNotesToParatext;
            await Task.CompletedTask;
        }
    }
}
