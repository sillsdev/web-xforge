using System;
using System.Collections.Generic;
using NUnit.Framework;
using Paratext.Data;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class SharingLogicWrapperTests
{
    private const string ParatextUser01 = "ParatextUser01";

    [Test]
    public void HandleErrors_DoesNotThrowByDefault()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.DoesNotThrow(() => env.Service.HandleErrors(() => throw new CannotConnectException()));
    }

    [Test]
    public void HandleErrors_ThrowsWhenSpecified()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        Assert.Throws<CannotConnectException>(() =>
            env.Service.HandleErrors(() => throw new CannotConnectException(), throwExceptions: true)
        );
    }

    [Test]
    public void SearchForBestProjectUsersData_Success()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        PermissionManager actual = env.Service.SearchForBestProjectUsersData(
            new SharedRepositorySource(),
            new SharedProject()
        );
        Assert.That(actual, Is.Not.Null);
    }

    [Test]
    public void ShareChanges_Success()
    {
        // Setup
        var env = new TestEnvironment();

        // SUT
        bool actual = env.Service.ShareChanges(
            sharedProjects: [],
            new SharedRepositorySource(),
            out List<SendReceiveResult> results,
            reviewProjects: []
        );
        Assert.That(actual, Is.True);
        Assert.That(results, Is.Empty);
    }

    [Test]
    public void ShareChanges_ThrowsExceptionIfObserver()
    {
        // Setup
        var env = new TestEnvironment();

        // Create a shared project with a user that is an observer
        var sharedProject = new SharedProject { Permissions = new ParatextRegistryPermissionManager(ParatextUser01) };
        sharedProject.Permissions.CreateUser(ParatextUser01);

        // SUT
        Assert.Throws<InvalidOperationException>(() =>
            env.Service.ShareChanges(
                sharedProjects: [sharedProject],
                new SharedRepositorySource(),
                out List<SendReceiveResult> _,
                reviewProjects: []
            )
        );
    }

    private class TestEnvironment
    {
        public SharingLogicWrapper Service { get; } = new SharingLogicWrapper();
    }
}
