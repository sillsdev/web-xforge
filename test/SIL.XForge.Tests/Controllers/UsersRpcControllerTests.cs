using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Defaults;
using Microsoft.AspNetCore.Hosting;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Controllers;

[TestFixture]
public class UsersRpcControllerTests
{
    private static readonly string[] Roles = [SystemRole.User];
    private const string User01 = "user01";
    private const string User02 = "user02";

    [Test]
    public async Task Delete_Forbidden()
    {
        var env = new TestEnvironment();
        env.UserService.DeleteAsync(User01, Roles, User02).Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.Delete(User02);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
    }

    [Test]
    public async Task Delete_Success()
    {
        var env = new TestEnvironment();

        // SUT
        var result = await env.Controller.Delete(User02);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.UserService.Received(1).DeleteAsync(User01, Roles, User02);
    }

    [Test]
    public void Delete_UnknownError()
    {
        var env = new TestEnvironment();
        env.UserService.DeleteAsync(User01, Roles, User02).Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.Delete(User02));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            var userAccessor = Substitute.For<IUserAccessor>();
            userAccessor.UserId.Returns(User01);
            userAccessor.SystemRoles.Returns(Roles);
            UserService = Substitute.For<IUserService>();
            var authService = Substitute.For<IAuthService>();
            var hostingEnv = Substitute.For<IWebHostEnvironment>();
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            Controller = new UsersRpcController(userAccessor, UserService, authService, hostingEnv, ExceptionHandler);
        }

        public UsersRpcController Controller { get; }
        public IExceptionHandler ExceptionHandler { get; }
        public IUserService UserService { get; }
    }
}
