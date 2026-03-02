using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using EdjCase.JsonRpc.Common;
using EdjCase.JsonRpc.Router.Defaults;
using Hangfire;
using Hangfire.Common;
using Hangfire.States;
using NSubstitute;
using NSubstitute.ExceptionExtensions;
using NUnit.Framework;
using SIL.XForge.Controllers;
using SIL.XForge.Models;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Controllers;

[TestFixture]
public class SFProjectsRpcControllerTests
{
    private const string Data01 = "data01";
    private const string Project01 = "project01";
    private const string Role01 = "role01";
    private const string User01 = "user01";
    private const string User02 = "user02";
    private const int DaysBeforeExpiration = 365;
    private static readonly string[] Permissions =
    [
        SFProjectRights.JoinRight(SFProjectDomain.Questions, Operation.Create),
        SFProjectRights.JoinRight(SFProjectDomain.Questions, Operation.Edit),
    ];
    private static readonly string[] Roles = [SystemRole.User];

    // Constants for Invite
    const string Email = "test@example.com";
    const string Role = SFProjectRole.Commenter;
    const string Locale = "en";
    private static readonly Uri WebsiteUrl = new Uri("https://scriptureforge.org", UriKind.Absolute);

    [Test]
    public async Task ApplyPreTranslationToProject_Success()
    {
        var env = new TestEnvironment();

        // SUT
        var result = await env.Controller.ApplyPreTranslationToProject(
            Project01,
            "GEN-EXO",
            Project01,
            DateTime.UtcNow
        );
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        env.BackgroundJobClient.Received().Create(Arg.Any<Job>(), Arg.Any<IState>());
    }

    [Test]
    public async Task ApplyPreTranslationToProject_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Project Not Found";
        env.SFProjectService.GetProjectAsync(Project01).Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.ApplyPreTranslationToProject(
            Project01,
            "GEN-EXO",
            Project01,
            DateTime.UtcNow
        );

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void ApplyPreTranslationToProject_UnknownError()
    {
        var env = new TestEnvironment();
        env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() =>
            env.Controller.ApplyPreTranslationToProject(Project01, "GEN-EXO", Project01, DateTime.UtcNow)
        );
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task Delete_Success()
    {
        var env = new TestEnvironment();

        // SUT
        var result = await env.Controller.Delete(Project01);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().DeleteProjectAsync(User01, Project01);
    }

    [Test]
    public async Task Delete_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.DeleteProjectAsync(User01, Project01).Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.Delete(Project01);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task Delete_InvalidParams()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Invalid Format";
        env.SFProjectService.DeleteProjectAsync(User01, Project01).Throws(new InvalidOperationException(errorMessage));

        // SUT
        var result = await env.Controller.Delete(Project01);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
    }

    [Test]
    public async Task Delete_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.DeleteProjectAsync(User01, Project01).Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.Delete(Project01);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void Delete_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.DeleteProjectAsync(User01, Project01).Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.Delete(Project01));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task DeleteTrainingData_Success()
    {
        var env = new TestEnvironment();

        // SUT
        var result = await env.Controller.DeleteTrainingData(Project01, User02, Data01);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.TrainingDataService.Received().DeleteTrainingDataAsync(User01, Project01, User02, Data01);
    }

    [Test]
    public async Task DeleteTrainingData_Forbidden()
    {
        var env = new TestEnvironment();
        env.TrainingDataService.DeleteTrainingDataAsync(User01, Project01, User02, Data01)
            .Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.DeleteTrainingData(Project01, User02, Data01);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task DeleteTrainingData_InvalidParams()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Invalid Format";
        env.TrainingDataService.DeleteTrainingDataAsync(User01, Project01, User02, Data01)
            .Throws(new FormatException(errorMessage));

        // SUT
        var result = await env.Controller.DeleteTrainingData(Project01, User02, Data01);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
    }

    [Test]
    public async Task DeleteTrainingData_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.TrainingDataService.DeleteTrainingDataAsync(User01, Project01, User02, Data01)
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.DeleteTrainingData(Project01, User02, Data01);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void DeleteTrainingData_UnknownError()
    {
        var env = new TestEnvironment();
        env.TrainingDataService.DeleteTrainingDataAsync(User01, Project01, User02, Data01)
            .Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.DeleteTrainingData(Project01, User02, Data01));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task EventMetrics_Success()
    {
        var env = new TestEnvironment();
        const int pageIndex = 0;
        const int pageSize = 10;

        // SUT
        var result = await env.Controller.EventMetrics(
            Project01,
            scopes: null,
            eventTypes: null,
            fromDate: null,
            toDate: null,
            pageIndex,
            pageSize
        );
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env
            .SFProjectService.Received()
            .GetEventMetricsAsync(
                User01,
                Roles,
                Project01,
                scopes: null,
                eventTypes: null,
                fromDate: null,
                toDate: null,
                pageIndex,
                pageSize
            );
    }

    [Test]
    public async Task EventMetrics_Forbidden()
    {
        var env = new TestEnvironment();
        const int pageIndex = 0;
        const int pageSize = 10;
        env.SFProjectService.GetEventMetricsAsync(
                User01,
                Roles,
                Project01,
                scopes: null,
                eventTypes: null,
                fromDate: null,
                toDate: null,
                pageIndex,
                pageSize
            )
            .Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.EventMetrics(
            Project01,
            scopes: null,
            eventTypes: null,
            fromDate: null,
            toDate: null,
            pageIndex,
            pageSize
        );
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task EventMetrics_InvalidParams()
    {
        var env = new TestEnvironment();
        const int pageIndex = 0;
        const int pageSize = 10;
        const string errorMessage = "Invalid Format";
        env.SFProjectService.GetEventMetricsAsync(
                User01,
                Roles,
                Project01,
                scopes: null,
                eventTypes: null,
                fromDate: null,
                toDate: null,
                pageIndex,
                pageSize
            )
            .Throws(new FormatException(errorMessage));

        // SUT
        var result = await env.Controller.EventMetrics(
            Project01,
            scopes: null,
            eventTypes: null,
            fromDate: null,
            toDate: null,
            pageIndex,
            pageSize
        );
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
    }

    [Test]
    public async Task EventMetrics_NotFound()
    {
        var env = new TestEnvironment();
        const int pageIndex = 0;
        const int pageSize = 10;
        const string errorMessage = "Not Found";
        env.SFProjectService.GetEventMetricsAsync(
                User01,
                Roles,
                Project01,
                scopes: null,
                eventTypes: null,
                fromDate: null,
                toDate: null,
                pageIndex,
                pageSize
            )
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.EventMetrics(
            Project01,
            scopes: null,
            eventTypes: null,
            fromDate: null,
            toDate: null,
            pageIndex,
            pageSize
        );
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void EventMetrics_UnknownError()
    {
        var env = new TestEnvironment();
        const int pageIndex = 0;
        const int pageSize = 10;
        env.SFProjectService.GetEventMetricsAsync(
                User01,
                Roles,
                Project01,
                scopes: null,
                eventTypes: null,
                fromDate: null,
                toDate: null,
                pageIndex,
                pageSize
            )
            .Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() =>
            env.Controller.EventMetrics(
                Project01,
                scopes: null,
                eventTypes: null,
                fromDate: null,
                toDate: null,
                pageIndex,
                pageSize
            )
        );
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task Invite_Success()
    {
        var env = new TestEnvironment();
        env.SFProjectService.InviteAsync(User01, Project01, Email, Locale, Role, WebsiteUrl)
            .Returns(Task.FromResult(true));

        // SUT
        var result = await env.Controller.Invite(Project01, Email, Locale, Role);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().InviteAsync(User01, Project01, Email, Locale, Role, WebsiteUrl);
    }

    [Test]
    public async Task Invite_SuccessAlreadyMember()
    {
        var env = new TestEnvironment();
        env.SFProjectService.InviteAsync(User01, Project01, Email, Locale, Role, WebsiteUrl)
            .Returns(Task.FromResult(false));

        // SUT
        var result = await env.Controller.Invite(Project01, Email, Locale, Role);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        Assert.AreEqual(
            SFProjectsRpcController.AlreadyProjectMemberResponse,
            (result as RpcMethodSuccessResult)!.ReturnObject
        );
        await env.SFProjectService.Received().InviteAsync(User01, Project01, Email, Locale, Role, WebsiteUrl);
    }

    [Test]
    public async Task Invite_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.InviteAsync(User01, Project01, Email, Locale, Role, WebsiteUrl)
            .Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.Invite(Project01, Email, Locale, Role);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task Invite_InvalidEmail()
    {
        var env = new TestEnvironment();
        const string errorMessage = SFProjectService.InvalidEmailAddress;
        env.SFProjectService.InviteAsync(User01, Project01, Email, Locale, Role, WebsiteUrl)
            .Throws(new InvalidOperationException(errorMessage));

        // SUT
        var result = await env.Controller.Invite(Project01, Email, Locale, Role);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual((int)RpcErrorCode.InvalidParams, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task Invite_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.InviteAsync(User01, Project01, Email, Locale, Role, WebsiteUrl)
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.Invite(Project01, Email, Locale, Role);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void Invite_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.InviteAsync(User01, Project01, Email, Locale, Role, WebsiteUrl)
            .Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.Invite(Project01, Email, Locale, Role));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

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
        await env.SFProjectService.Received().UpdateRoleAsync(User01, Roles, Project01, User02, projectRole);
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
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
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
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
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
    public async Task LinkSharingKey_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.GetLinkSharingKeyAsync(
                User01,
                Project01,
                Role01,
                ShareLinkType.Recipient,
                DaysBeforeExpiration
            )
            .Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.LinkSharingKey(
            Project01,
            Role01,
            ShareLinkType.Recipient,
            DaysBeforeExpiration
        );
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task LinkSharingKey_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.GetLinkSharingKeyAsync(
                User01,
                Project01,
                Role01,
                ShareLinkType.Recipient,
                DaysBeforeExpiration
            )
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.LinkSharingKey(
            Project01,
            Role01,
            ShareLinkType.Recipient,
            DaysBeforeExpiration
        );
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task LinkSharingKey_Success()
    {
        var env = new TestEnvironment();

        // SUT
        var result = await env.Controller.LinkSharingKey(
            Project01,
            Role01,
            ShareLinkType.Recipient,
            DaysBeforeExpiration
        );
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env
            .SFProjectService.Received()
            .GetLinkSharingKeyAsync(User01, Project01, Role01, ShareLinkType.Recipient, DaysBeforeExpiration);
    }

    [Test]
    public void LinkSharingKey_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.GetLinkSharingKeyAsync(
                User01,
                Project01,
                Role01,
                ShareLinkType.Recipient,
                DaysBeforeExpiration
            )
            .Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() =>
            env.Controller.LinkSharingKey(Project01, Role01, ShareLinkType.Recipient, DaysBeforeExpiration)
        );
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public void RetrievePreTranslationStatus_Success()
    {
        var env = new TestEnvironment();

        // SUT
        var result = env.Controller.RetrievePreTranslationStatus(Project01);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        env.BackgroundJobClient.Received().Create(Arg.Any<Job>(), Arg.Any<IState>());
    }

    [Test]
    public void RetrievePreTranslationStatus_UnknownError()
    {
        var env = new TestEnvironment();
        env.BackgroundJobClient.Create(Arg.Any<Job>(), Arg.Any<IState>()).Throws(new ArgumentNullException());

        // SUT
        Assert.Throws<ArgumentNullException>(() => env.Controller.RetrievePreTranslationStatus(Project01));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    [Obsolete]
    public async Task AddChapters_Success()
    {
        var env = new TestEnvironment();
        const int book = 1;
        int[] chapters = [2, 3];

        // SUT
        var result = await env.Controller.AddChapters(Project01, book, chapters);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().AddChaptersAsync(User01, Project01, book, chapters);
    }

    [Test]
    [Obsolete]
    public async Task AddChapters_Forbidden()
    {
        var env = new TestEnvironment();
        const int book = 1;
        int[] chapters = [2, 3];
        env.SFProjectService.AddChaptersAsync(User01, Project01, book, chapters).Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.AddChapters(Project01, book, chapters);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    [Obsolete]
    public async Task AddChapters_NotFound()
    {
        var env = new TestEnvironment();
        const int book = 1;
        int[] chapters = [2, 3];
        const string errorMessage = "Not Found";
        env.SFProjectService.AddChaptersAsync(User01, Project01, book, chapters)
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.AddChapters(Project01, book, chapters);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task SetDraftApplied_Success()
    {
        var env = new TestEnvironment();
        const int book = 40;
        const int chapter = 1;
        const bool draftApplied = true;
        const int lastVerse = 25;

        // SUT
        var result = await env.Controller.SetDraftApplied(Project01, book, chapter, draftApplied, lastVerse);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env
            .SFProjectService.Received()
            .SetDraftAppliedAsync(User01, Project01, book, chapter, draftApplied, lastVerse);
    }

    [Test]
    public async Task SetDraftApplied_Forbidden()
    {
        var env = new TestEnvironment();
        const int book = 40;
        const int chapter = 1;
        const bool draftApplied = true;
        const int lastVerse = 25;
        env.SFProjectService.SetDraftAppliedAsync(User01, Project01, book, chapter, draftApplied, lastVerse)
            .Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.SetDraftApplied(Project01, book, chapter, draftApplied, lastVerse);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task SetDraftApplied_NotFound()
    {
        var env = new TestEnvironment();
        const int book = 40;
        const int chapter = 1;
        const bool draftApplied = true;
        const int lastVerse = 25;
        const string errorMessage = "Not Found";
        env.SFProjectService.SetDraftAppliedAsync(User01, Project01, book, chapter, draftApplied, lastVerse)
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.SetDraftApplied(Project01, book, chapter, draftApplied, lastVerse);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void SetDraftApplied_UnknownError()
    {
        var env = new TestEnvironment();
        const int book = 40;
        const int chapter = 1;
        const bool draftApplied = true;
        const int lastVerse = 25;
        env.SFProjectService.SetDraftAppliedAsync(User01, Project01, book, chapter, draftApplied, lastVerse)
            .Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() =>
            env.Controller.SetDraftApplied(Project01, book, chapter, draftApplied, lastVerse)
        );
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
        await env.SFProjectService.Received().SetPreTranslateAsync(User01, Roles, Project01, preTranslate);
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
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
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
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
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
        await env.SFProjectService.Received().SetSyncDisabledAsync(User01, Roles, Project01, syncDisabled);
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
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
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
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
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
    public async Task GetProjectIdByParatextId_Success()
    {
        var env = new TestEnvironment();
        const string paratextId = "paratext-id";
        const string projectId = "project-id";
        env.SFProjectService.GetProjectIdFromParatextIdAsync(Roles, paratextId).Returns(projectId);

        var result = await env.Controller.GetProjectIdByParatextId(paratextId);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        Assert.AreEqual(projectId, (result as RpcMethodSuccessResult)!.ReturnObject);
        await env.SFProjectService.Received().GetProjectIdFromParatextIdAsync(Roles, paratextId);
    }

    [Test]
    public async Task GetProjectIdByParatextId_Forbidden()
    {
        var env = new TestEnvironment();
        const string paratextId = "paratext-id";
        env.SFProjectService.GetProjectIdFromParatextIdAsync(Roles, paratextId).Throws(new ForbiddenException());

        var result = await env.Controller.GetProjectIdByParatextId(paratextId);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task GetProjectIdByParatextId_NotFound()
    {
        var env = new TestEnvironment();
        const string paratextId = "paratext-id";
        const string errorMessage = "Not Found";
        env.SFProjectService.GetProjectIdFromParatextIdAsync(Roles, paratextId)
            .Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.GetProjectIdByParatextId(paratextId);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task GetProjectIdByParatextId_InvalidParams()
    {
        var env = new TestEnvironment();
        const string paratextId = "paratext-id";
        const string errorMessage = "The Paratext ID must be provided.";
        env.SFProjectService.GetProjectIdFromParatextIdAsync(Roles, paratextId)
            .Throws(new InvalidOperationException(errorMessage));

        var result = await env.Controller.GetProjectIdByParatextId(paratextId);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual((int)RpcErrorCode.InvalidParams, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void GetProjectIdByParatextId_UnknownError()
    {
        var env = new TestEnvironment();
        const string paratextId = "paratext-id";
        env.SFProjectService.GetProjectIdFromParatextIdAsync(Roles, paratextId).Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.GetProjectIdByParatextId(paratextId));
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
        await env.SFProjectService.Received().SetServalConfigAsync(User01, Roles, Project01, servalConfig);
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
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
        await env.SFProjectService.Received().SetServalConfigAsync(User01, Roles, Project01, servalConfig);
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
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
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
    public async Task SetUsfmConfig_Success()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SetUsfmConfigAsync(User01, Project01, Arg.Any<DraftUsfmConfig>())
            .Returns(Task.FromResult(true));
        // SUT
        var result = await env.Controller.SetUsfmConfig(Project01, new DraftUsfmConfig());
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
    }

    [Test]
    public async Task SetUsfmConfig_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SetUsfmConfigAsync(User01, Project01, Arg.Any<DraftUsfmConfig>())
            .Throws(new ForbiddenException());
        // SUT
        var result = await env.Controller.SetUsfmConfig(Project01, new DraftUsfmConfig());
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task SetUsfmConfig_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.SetUsfmConfigAsync(User01, Project01, Arg.Any<DraftUsfmConfig>())
            .Throws(new DataNotFoundException(errorMessage));
        // SUT

        var result = await env.Controller.SetUsfmConfig(Project01, new DraftUsfmConfig());
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void SetUsfmConfig_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SetUsfmConfigAsync(User01, Project01, Arg.Any<DraftUsfmConfig>())
            .Throws(new ArgumentNullException());
        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.SetUsfmConfig(Project01, new DraftUsfmConfig()));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task SetRoleProjectPermissions_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SetRoleProjectPermissionsAsync(User01, Project01, Role01, Permissions)
            .Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.SetRoleProjectPermissions(Project01, Role01, Permissions);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task SetRoleProjectPermissions_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.SetRoleProjectPermissionsAsync(User01, Project01, Role01, Permissions)
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.SetRoleProjectPermissions(Project01, Role01, Permissions);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task SetRoleProjectPermissions_Success()
    {
        var env = new TestEnvironment();

        // SUT
        var result = await env.Controller.SetRoleProjectPermissions(Project01, Role01, Permissions);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().SetRoleProjectPermissionsAsync(User01, Project01, Role01, Permissions);
    }

    [Test]
    public void SetRoleProjectPermissions_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SetRoleProjectPermissionsAsync(User01, Project01, Role01, Permissions)
            .Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() =>
            env.Controller.SetRoleProjectPermissions(Project01, Role01, Permissions)
        );
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task SetUserProjectPermissions_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SetUserProjectPermissionsAsync(User01, Project01, User02, Permissions)
            .Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.SetUserProjectPermissions(Project01, User02, Permissions);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task SetUserProjectPermissions_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.SetUserProjectPermissionsAsync(User01, Project01, User02, Permissions)
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.SetUserProjectPermissions(Project01, User02, Permissions);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task SetUserProjectPermissions_Success()
    {
        var env = new TestEnvironment();

        // SUT
        var result = await env.Controller.SetUserProjectPermissions(Project01, User02, Permissions);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().SetUserProjectPermissionsAsync(User01, Project01, User02, Permissions);
    }

    [Test]
    public void SetUserProjectPermissions_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SetUserProjectPermissionsAsync(User01, Project01, User02, Permissions)
            .Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() =>
            env.Controller.SetUserProjectPermissions(Project01, User02, Permissions)
        );
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task Sync_Success()
    {
        var env = new TestEnvironment();

        // SUT
        var result = await env.Controller.Sync(Project01);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().SyncAsync(User01, Project01);
    }

    [Test]
    public async Task Sync_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SyncAsync(User01, Project01).Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.Sync(Project01);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task Sync_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.SyncAsync(User01, Project01).Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.Sync(Project01);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task Sync_Unauthorized()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SyncAsync(User01, Project01).Throws(new UnauthorizedAccessException());

        // SUT
        var result = await env.Controller.Sync(Project01);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void Sync_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SyncAsync(User01, Project01).Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.Sync(Project01));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task TransceleratorQuestions_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.TransceleratorQuestionsAsync(User01, Project01).Throws(new ForbiddenException());

        // SUT
        var result = await env.Controller.TransceleratorQuestions(Project01);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task TransceleratorQuestions_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.TransceleratorQuestionsAsync(User01, Project01)
            .Throws(new DataNotFoundException(errorMessage));

        // SUT
        var result = await env.Controller.TransceleratorQuestions(Project01);
        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task TransceleratorQuestions_Success()
    {
        var env = new TestEnvironment();

        // SUT
        var result = await env.Controller.TransceleratorQuestions(Project01);
        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().TransceleratorQuestionsAsync(User01, Project01);
    }

    [Test]
    public void TransceleratorQuestions_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.TransceleratorQuestionsAsync(User01, Project01).Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.TransceleratorQuestions(Project01));
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
        await env.SFProjectService.Received().UpdateSettingsAsync(User01, Project01, settings);
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
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
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
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void UpdateSettings_UnknownError()
    {
        var env = new TestEnvironment();
        var settings = new SFProjectSettings
        {
            BiblicalTermsEnabled = true,
            CheckingAnswerExport = string.Empty,
            CheckingEnabled = true,
            HideCommunityCheckingText = true,
            SourceParatextId = string.Empty,
            TranslationSuggestionsEnabled = true,
            UsersSeeEachOthersResponses = true,
        };
        env.SFProjectService.UpdateSettingsAsync(User01, Project01, settings).Throws(new ArgumentNullException());

        // SUT
        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.UpdateSettings(Project01, settings));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task AddUser_WithRole_Success()
    {
        var env = new TestEnvironment();
        const string projectRole = SFProjectRole.Viewer;

        var result = await env.Controller.AddUser(Project01, projectRole);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().AddUserAsync(User01, Project01, projectRole);
    }

    [Test]
    public async Task AddUser_WithRole_Forbidden()
    {
        var env = new TestEnvironment();
        const string projectRole = SFProjectRole.Viewer;
        env.SFProjectService.AddUserAsync(User01, Project01, projectRole).Throws(new ForbiddenException());

        var result = await env.Controller.AddUser(Project01, projectRole);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task AddUser_WithRole_NotFound()
    {
        var env = new TestEnvironment();
        const string projectRole = SFProjectRole.Viewer;
        const string errorMessage = "Not Found";
        env.SFProjectService.AddUserAsync(User01, Project01, projectRole)
            .Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.AddUser(Project01, projectRole);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void AddUser_WithRole_UnknownError()
    {
        var env = new TestEnvironment();
        const string projectRole = SFProjectRole.Viewer;
        env.SFProjectService.AddUserAsync(User01, Project01, projectRole).Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.AddUser(Project01, projectRole));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task AddUser_WithoutRole_Success()
    {
        var env = new TestEnvironment();

        var result = await env.Controller.AddUser(Project01);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().AddUserAsync(User01, Project01, null);
    }

    [Test]
    public async Task RemoveUser_Success()
    {
        var env = new TestEnvironment();

        var result = await env.Controller.RemoveUser(Project01, User02);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().RemoveUserAsync(User01, Project01, User02);
    }

    [Test]
    public async Task RemoveUser_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.RemoveUserAsync(User01, Project01, User02).Throws(new ForbiddenException());

        var result = await env.Controller.RemoveUser(Project01, User02);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task RemoveUser_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.RemoveUserAsync(User01, Project01, User02).Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.RemoveUser(Project01, User02);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void RemoveUser_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.RemoveUserAsync(User01, Project01, User02).Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.RemoveUser(Project01, User02));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task GetProjectRole_Success()
    {
        var env = new TestEnvironment();
        env.SFProjectService.GetProjectRoleAsync(User01, Project01).Returns(Role01);

        var result = await env.Controller.GetProjectRole(Project01);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        Assert.AreEqual(Role01, (result as RpcMethodSuccessResult)!.ReturnObject);
    }

    [Test]
    public async Task GetProjectRole_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.GetProjectRoleAsync(User01, Project01).Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.GetProjectRole(Project01);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void GetProjectRole_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.GetProjectRoleAsync(User01, Project01).Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.GetProjectRole(Project01));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task SyncUserRole_Success()
    {
        var env = new TestEnvironment();

        var result = await env.Controller.SyncUserRole(Project01);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().SyncUserRoleAsync(User01, Project01);
    }

    [Test]
    public async Task SyncUserRole_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SyncUserRoleAsync(User01, Project01).Throws(new ForbiddenException());

        var result = await env.Controller.SyncUserRole(Project01);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task SyncUserRole_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.SyncUserRoleAsync(User01, Project01).Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.SyncUserRole(Project01);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void SyncUserRole_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SyncUserRoleAsync(User01, Project01).Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.SyncUserRole(Project01));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task IsAlreadyInvited_Success()
    {
        var env = new TestEnvironment();
        env.SFProjectService.IsAlreadyInvitedAsync(User01, Project01, Email).Returns(true);

        var result = await env.Controller.IsAlreadyInvited(Project01, Email);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        Assert.AreEqual(true, (result as RpcMethodSuccessResult)!.ReturnObject);
    }

    [Test]
    public async Task IsAlreadyInvited_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.IsAlreadyInvitedAsync(User01, Project01, Email).Throws(new ForbiddenException());

        var result = await env.Controller.IsAlreadyInvited(Project01, Email);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task IsAlreadyInvited_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.IsAlreadyInvitedAsync(User01, Project01, Email)
            .Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.IsAlreadyInvited(Project01, Email);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void IsAlreadyInvited_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.IsAlreadyInvitedAsync(User01, Project01, Email).Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.IsAlreadyInvited(Project01, Email));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task JoinWithShareKey_Success()
    {
        var env = new TestEnvironment();
        env.SFProjectService.JoinWithShareKeyAsync(User01, Data01).Returns(Project01);

        var result = await env.Controller.JoinWithShareKey(Data01);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        Assert.AreEqual(Project01, (result as RpcMethodSuccessResult)!.ReturnObject);
    }

    [Test]
    public async Task JoinWithShareKey_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.JoinWithShareKeyAsync(User01, Data01).Throws(new ForbiddenException());

        var result = await env.Controller.JoinWithShareKey(Data01);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task JoinWithShareKey_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.JoinWithShareKeyAsync(User01, Data01).Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.JoinWithShareKey(Data01);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void JoinWithShareKey_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.JoinWithShareKeyAsync(User01, Data01).Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.JoinWithShareKey(Data01));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public void IsSourceProject_ReturnsValue()
    {
        var env = new TestEnvironment();
        env.SFProjectService.IsSourceProject(Project01).Returns(true);

        var result = env.Controller.IsSourceProject(Project01);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        Assert.AreEqual(true, (result as RpcMethodSuccessResult)!.ReturnObject);
    }

    [Test]
    public async Task ReserveLinkSharingKey_Success()
    {
        var env = new TestEnvironment();

        var result = await env.Controller.ReserveLinkSharingKey(Data01, DaysBeforeExpiration);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().ReserveLinkSharingKeyAsync(User01, Data01, DaysBeforeExpiration);
    }

    [Test]
    public async Task ReserveLinkSharingKey_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.ReserveLinkSharingKeyAsync(User01, Data01, DaysBeforeExpiration)
            .Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.ReserveLinkSharingKey(Data01, DaysBeforeExpiration);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void ReserveLinkSharingKey_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.ReserveLinkSharingKeyAsync(User01, Data01, DaysBeforeExpiration)
            .Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() =>
            env.Controller.ReserveLinkSharingKey(Data01, DaysBeforeExpiration)
        );
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task AddTranslateMetrics_Success()
    {
        var env = new TestEnvironment();
        var metrics = new TranslateMetrics { Id = Data01 };

        var result = await env.Controller.AddTranslateMetrics(Project01, metrics);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().AddTranslateMetricsAsync(User01, Project01, metrics);
    }

    [Test]
    public async Task AddTranslateMetrics_Forbidden()
    {
        var env = new TestEnvironment();
        var metrics = new TranslateMetrics { Id = Data01 };
        env.SFProjectService.AddTranslateMetricsAsync(User01, Project01, metrics).Throws(new ForbiddenException());

        var result = await env.Controller.AddTranslateMetrics(Project01, metrics);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task AddTranslateMetrics_NotFound()
    {
        var env = new TestEnvironment();
        var metrics = new TranslateMetrics { Id = Data01 };
        const string errorMessage = "Not Found";
        env.SFProjectService.AddTranslateMetricsAsync(User01, Project01, metrics)
            .Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.AddTranslateMetrics(Project01, metrics);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void AddTranslateMetrics_UnknownError()
    {
        var env = new TestEnvironment();
        var metrics = new TranslateMetrics { Id = Data01 };
        env.SFProjectService.AddTranslateMetricsAsync(User01, Project01, metrics).Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.AddTranslateMetrics(Project01, metrics));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task CancelSync_Success()
    {
        var env = new TestEnvironment();

        var result = await env.Controller.CancelSync(Project01);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().CancelSyncAsync(User01, Project01);
    }

    [Test]
    public async Task CancelSync_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.CancelSyncAsync(User01, Project01).Throws(new ForbiddenException());

        var result = await env.Controller.CancelSync(Project01);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task CancelSync_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.CancelSyncAsync(User01, Project01).Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.CancelSync(Project01);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void CancelSync_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.CancelSyncAsync(User01, Project01).Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.CancelSync(Project01));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task DeleteAudio_Success()
    {
        var env = new TestEnvironment();

        var result = await env.Controller.DeleteAudio(Project01, User02, Data01);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().DeleteAudioAsync(User01, Project01, User02, Data01);
    }

    [Test]
    public async Task DeleteAudio_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.DeleteAudioAsync(User01, Project01, User02, Data01).Throws(new ForbiddenException());

        var result = await env.Controller.DeleteAudio(Project01, User02, Data01);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task DeleteAudio_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.DeleteAudioAsync(User01, Project01, User02, Data01)
            .Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.DeleteAudio(Project01, User02, Data01);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task DeleteAudio_InvalidParams()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Invalid format";
        env.SFProjectService.DeleteAudioAsync(User01, Project01, User02, Data01)
            .Throws(new FormatException(errorMessage));

        var result = await env.Controller.DeleteAudio(Project01, User02, Data01);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual((int)RpcErrorCode.InvalidParams, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void DeleteAudio_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.DeleteAudioAsync(User01, Project01, User02, Data01).Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.DeleteAudio(Project01, User02, Data01));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task MarkTrainingDataDeleted_Success()
    {
        var env = new TestEnvironment();

        var result = await env.Controller.MarkTrainingDataDeleted(Project01, Data01);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.TrainingDataService.Received().MarkFileDeleted(User01, Project01, Data01);
    }

    [Test]
    public async Task MarkTrainingDataDeleted_Forbidden()
    {
        var env = new TestEnvironment();
        env.TrainingDataService.MarkFileDeleted(User01, Project01, Data01).Throws(new ForbiddenException());

        var result = await env.Controller.MarkTrainingDataDeleted(Project01, Data01);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task MarkTrainingDataDeleted_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.TrainingDataService.MarkFileDeleted(User01, Project01, Data01)
            .Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.MarkTrainingDataDeleted(Project01, Data01);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void MarkTrainingDataDeleted_UnknownError()
    {
        var env = new TestEnvironment();
        env.TrainingDataService.MarkFileDeleted(User01, Project01, Data01).Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.MarkTrainingDataDeleted(Project01, Data01));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task CreateAudioTimingData_Success()
    {
        var env = new TestEnvironment();
        var timingData = new List<AudioTiming>();

        var result = await env.Controller.CreateAudioTimingData(Project01, 1, 2, timingData, "url");

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().CreateAudioTimingData(User01, Project01, 1, 2, timingData, "url");
    }

    [Test]
    public async Task CreateAudioTimingData_Forbidden()
    {
        var env = new TestEnvironment();
        var timingData = new List<AudioTiming>();
        env.SFProjectService.CreateAudioTimingData(User01, Project01, 1, 2, timingData, "url")
            .Throws(new ForbiddenException());

        var result = await env.Controller.CreateAudioTimingData(Project01, 1, 2, timingData, "url");

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task CreateAudioTimingData_NotFound()
    {
        var env = new TestEnvironment();
        var timingData = new List<AudioTiming>();
        const string errorMessage = "Not Found";
        env.SFProjectService.CreateAudioTimingData(User01, Project01, 1, 2, timingData, "url")
            .Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.CreateAudioTimingData(Project01, 1, 2, timingData, "url");

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void CreateAudioTimingData_UnknownError()
    {
        var env = new TestEnvironment();
        var timingData = new List<AudioTiming>();
        env.SFProjectService.CreateAudioTimingData(User01, Project01, 1, 2, timingData, "url")
            .Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() =>
            env.Controller.CreateAudioTimingData(Project01, 1, 2, timingData, "url")
        );
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task DeleteAudioTimingData_Success()
    {
        var env = new TestEnvironment();

        var result = await env.Controller.DeleteAudioTimingData(Project01, 1, 2);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().DeleteAudioTimingData(User01, Project01, 1, 2);
    }

    [Test]
    public async Task DeleteAudioTimingData_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.DeleteAudioTimingData(User01, Project01, 1, 2).Throws(new ForbiddenException());

        var result = await env.Controller.DeleteAudioTimingData(Project01, 1, 2);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task DeleteAudioTimingData_NotFound()
    {
        var env = new TestEnvironment();
        env.SFProjectService.DeleteAudioTimingData(User01, Project01, 1, 2)
            .Throws(new DataNotFoundException("missing"));

        var result = await env.Controller.DeleteAudioTimingData(Project01, 1, 2);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual("Audio timing data not found", (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void DeleteAudioTimingData_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.DeleteAudioTimingData(User01, Project01, 1, 2).Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.DeleteAudioTimingData(Project01, 1, 2));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    [Test]
    public async Task SetIsValid_Success()
    {
        var env = new TestEnvironment();

        var result = await env.Controller.SetIsValid(Project01, 1, 2, true);

        Assert.IsInstanceOf<RpcMethodSuccessResult>(result);
        await env.SFProjectService.Received().SetIsValidAsync(User01, Project01, 1, 2, true);
    }

    [Test]
    public async Task SetIsValid_Forbidden()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SetIsValidAsync(User01, Project01, 1, 2, true).Throws(new ForbiddenException());

        var result = await env.Controller.SetIsValid(Project01, 1, 2, true);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(RpcControllerBase.ForbiddenErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public async Task SetIsValid_NotFound()
    {
        var env = new TestEnvironment();
        const string errorMessage = "Not Found";
        env.SFProjectService.SetIsValidAsync(User01, Project01, 1, 2, true)
            .Throws(new DataNotFoundException(errorMessage));

        var result = await env.Controller.SetIsValid(Project01, 1, 2, true);

        Assert.IsInstanceOf<RpcMethodErrorResult>(result);
        Assert.AreEqual(errorMessage, (result as RpcMethodErrorResult)!.Message);
        Assert.AreEqual(RpcControllerBase.NotFoundErrorCode, (result as RpcMethodErrorResult)!.ErrorCode);
    }

    [Test]
    public void SetIsValid_UnknownError()
    {
        var env = new TestEnvironment();
        env.SFProjectService.SetIsValidAsync(User01, Project01, 1, 2, true).Throws(new ArgumentNullException());

        Assert.ThrowsAsync<ArgumentNullException>(() => env.Controller.SetIsValid(Project01, 1, 2, true));
        env.ExceptionHandler.Received().RecordEndpointInfoForException(Arg.Any<Dictionary<string, string>>());
    }

    private class TestEnvironment
    {
        public TestEnvironment()
        {
            BackgroundJobClient = Substitute.For<IBackgroundJobClient>();
            ExceptionHandler = Substitute.For<IExceptionHandler>();
            var httpRequestAccessor = Substitute.For<IHttpRequestAccessor>();
            httpRequestAccessor.SiteRoot.Returns(WebsiteUrl);
            SFProjectService = Substitute.For<ISFProjectService>();
            TrainingDataService = Substitute.For<ITrainingDataService>();
            var userAccessor = Substitute.For<IUserAccessor>();
            userAccessor.UserId.Returns(User01);
            userAccessor.SystemRoles.Returns(Roles);
            Controller = new SFProjectsRpcController(
                BackgroundJobClient,
                ExceptionHandler,
                httpRequestAccessor,
                SFProjectService,
                TrainingDataService,
                userAccessor
            );
        }

        public IBackgroundJobClient BackgroundJobClient { get; }
        public IExceptionHandler ExceptionHandler { get; }
        public SFProjectsRpcController Controller { get; }
        public ISFProjectService SFProjectService { get; }
        public ITrainingDataService TrainingDataService { get; }
    }
}
