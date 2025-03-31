using System.Linq;
using System.Net;
using System.Security.Claims;
using Duende.IdentityModel;
using Microsoft.AspNetCore.Http;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Models;
using SIL.XForge.Utils;

namespace SIL.XForge.Services;

[TestFixture]
public class UserAccessorTests
{
    [Test]
    public void UserAccessor_AuthId()
    {
        var env = new TestEnvironment();
        const string expected = "auth_id";
        env.HttpContextAccessor.HttpContext!.User = new ClaimsPrincipal(
            new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, expected)])
        );

        // SUT
        string actual = env.Service.AuthId;
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void UserAccessor_IsAuthenticated_False()
    {
        var env = new TestEnvironment();
        env.HttpContextAccessor.HttpContext!.User = new ClaimsPrincipal();

        // SUT
        Assert.IsFalse(env.Service.IsAuthenticated);
    }

    [Test]
    public void UserAccessor_IsAuthenticated_True()
    {
        var env = new TestEnvironment();
        env.HttpContextAccessor.HttpContext!.User = new ClaimsPrincipal(new ClaimsIdentity(null, "AuthType"));

        // SUT
        Assert.IsTrue(env.Service.IsAuthenticated);
    }

    [Test]
    public void UserAccessor_Name_FromClaim()
    {
        var env = new TestEnvironment();
        const string expected = "user_name";
        env.HttpContextAccessor.HttpContext!.User = new ClaimsPrincipal(
            new ClaimsIdentity([new Claim(JwtClaimTypes.Subject, expected)])
        );

        // SUT
        string actual = env.Service.Name;
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void UserAccessor_Name_FromIdentity()
    {
        var env = new TestEnvironment();
        const string expected = "user_name";
        env.HttpContextAccessor.HttpContext!.User = new ClaimsPrincipal(
            new HttpListenerBasicIdentity(expected, string.Empty)
        );

        // SUT
        string actual = env.Service.Name;
        Assert.AreEqual(expected, actual);
    }

    [Test]
    public void UserAccessor_Name_NoIdentity()
    {
        var env = new TestEnvironment();
        env.HttpContextAccessor.HttpContext!.User = new ClaimsPrincipal();

        // SUT
        string actual = env.Service.Name;
        Assert.AreEqual(string.Empty, actual);
    }

    [Test]
    public void UserAccessor_NoClaims()
    {
        var env = new TestEnvironment();
        env.HttpContextAccessor.HttpContext!.User = new ClaimsPrincipal(new ClaimsIdentity(null, string.Empty));

        // SUT
        Assert.AreEqual(string.Empty, env.Service.AuthId);
        Assert.IsFalse(env.Service.IsAuthenticated);
        Assert.AreEqual(string.Empty, env.Service.Name);
        Assert.IsEmpty(env.Service.SystemRoles);
        Assert.AreEqual(string.Empty, env.Service.UserId);
    }

    [Test]
    public void UserAccessor_NullHttpContext()
    {
        var env = new TestEnvironment { HttpContextAccessor = { HttpContext = null } };

        // SUT
        Assert.AreEqual(string.Empty, env.Service.AuthId);
        Assert.IsFalse(env.Service.IsAuthenticated);
        Assert.AreEqual(string.Empty, env.Service.Name);
        Assert.IsEmpty(env.Service.SystemRoles);
        Assert.AreEqual(string.Empty, env.Service.UserId);
    }

    [Test]
    public void UserAccessor_SystemRoles_MultipleRoles()
    {
        var env = new TestEnvironment();
        env.HttpContextAccessor.HttpContext!.User = new ClaimsPrincipal(
            new ClaimsIdentity(
                [new Claim(XFClaimTypes.Role, SystemRole.SystemAdmin), new Claim(XFClaimTypes.Role, SystemRole.User)]
            )
        );

        // SUT
        string[] actual = env.Service.SystemRoles;
        Assert.AreEqual(2, actual.Length);
        Assert.AreEqual(SystemRole.SystemAdmin, actual.First());
        Assert.AreEqual(SystemRole.User, actual.Last());
    }

    [Test]
    public void UserAccessor_SystemRoles_SingleRole()
    {
        var env = new TestEnvironment();
        const string expected = SystemRole.SystemAdmin;
        env.HttpContextAccessor.HttpContext!.User = new ClaimsPrincipal(
            new ClaimsIdentity([new Claim(XFClaimTypes.Role, expected)])
        );

        // SUT
        string[] actual = env.Service.SystemRoles;
        Assert.AreEqual(1, actual.Length);
        Assert.AreEqual(expected, actual.First());
    }

    [Test]
    public void UserAccessor_UserId()
    {
        var env = new TestEnvironment();
        const string expected = "user_id";
        env.HttpContextAccessor.HttpContext!.User = new ClaimsPrincipal(
            new ClaimsIdentity([new Claim(XFClaimTypes.UserId, expected)])
        );

        // SUT
        string actual = env.Service.UserId;
        Assert.AreEqual(expected, actual);
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            HttpContextAccessor = Substitute.For<IHttpContextAccessor>();
            HttpContextAccessor.HttpContext = new DefaultHttpContext();
            Service = new UserAccessor(HttpContextAccessor);
        }

        public IHttpContextAccessor HttpContextAccessor { get; }
        public UserAccessor Service { get; }
    }
}
