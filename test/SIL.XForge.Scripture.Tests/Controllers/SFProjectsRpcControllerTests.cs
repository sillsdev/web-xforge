using System.Threading.Tasks;
using EdjCase.JsonRpc.Router.Defaults;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers
{
    [TestFixture]
    public class SFProjectsRpcControllerTests
    {
        [Test]
        public async Task InvitedUsers_Available()
        {
            var env = new TestEnvironment();
            var output = (
                (await env.Controller.InvitedUsers("some-project-id")) as RpcMethodSuccessResult
            ).ReturnObject;
            Assert.That(output, Is.Not.Null);
        }

        [Test]
        public async Task UninviteUser_Available()
        {
            var env = new TestEnvironment();
            await env.Controller.UninviteUser("some-project-id", "some-email-address");
        }

        private class TestEnvironment
        {
            public TestEnvironment()
            {
                SFProjectService = Substitute.For<ISFProjectService>();
                UserAccessor = Substitute.For<IUserAccessor>();
                Controller = new SFProjectsRpcController(UserAccessor, SFProjectService);
            }

            public SFProjectsRpcController Controller { get; }
            public ISFProjectService SFProjectService { get; }
            public IUserAccessor UserAccessor { get; }
        }
    }
}
