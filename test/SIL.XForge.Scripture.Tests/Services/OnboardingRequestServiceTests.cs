using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

[TestFixture]
public class OnboardingRequestServiceTests
{
    private const string UserId = "user01";
    private const string ProjectId = "project01";
    private const string AdminUserId = "admin01";
    private const string AdminEmail = "admin@example.com";

    [Test]
    public async Task SubmitOnboardingRequestAsync_SendsCorrectEmailToAdmins()
    {
        var repository = Substitute.For<IRepository<OnboardingRequest>>();
        OnboardingRequest? capturedRequest = null;
        repository.InsertAsync(Arg.Do<OnboardingRequest>(r => capturedRequest = r)).Returns(Task.CompletedTask);

        var realtimeService = Substitute.For<IRealtimeService>();
        realtimeService
            .QuerySnapshots<SFProject>()
            .Returns(
                new List<SFProject>
                {
                    new SFProject
                    {
                        Id = ProjectId,
                        Name = "<script>alert(1)</script>",
                        ShortName = "<b>P01</b>",
                    },
                }.AsQueryable()
            );

        var scopedRealtimeService = Substitute.For<IRealtimeService>();
        var scopedConnection = Substitute.For<IConnection>();
        scopedRealtimeService.ConnectAsync(Arg.Any<string>()).Returns(scopedConnection);

        var adminUserDoc = Substitute.For<IDocument<User>>();
        adminUserDoc.Data.Returns(new User { Id = AdminUserId, Email = AdminEmail });
        scopedConnection
            .GetAndFetchDocsAsync<User>(Arg.Any<IReadOnlyCollection<string>>())
            .Returns(Task.FromResult<IReadOnlyCollection<IDocument<User>>>(new List<IDocument<User>> { adminUserDoc }));

        var scopedUserService = Substitute.For<IUserService>();
        scopedUserService.GetUsernameFromUserId(UserId, UserId).Returns("<img src=x onerror=alert(1)>");

        var emailService = Substitute.For<IEmailService>();
        var emailSentTcs = new TaskCompletionSource();
        emailService
            .When(e =>
                e.SendEmailAsync(Arg.Any<string>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>())
            )
            .Do(_ => emailSentTcs.TrySetResult());

        var scopedOnboardingRequestService = Substitute.For<IOnboardingRequestService>();
        scopedOnboardingRequestService
            .GetCurrentlyAssignedUserIdsAsync()
            .Returns(Task.FromResult<string[]>([AdminUserId]));

        var scopedExceptionHandler = Substitute.For<IExceptionHandler>();

        var serviceProvider = Substitute.For<IServiceProvider>();
        serviceProvider.GetService(typeof(IRealtimeService)).Returns(scopedRealtimeService);
        serviceProvider.GetService(typeof(IUserService)).Returns(scopedUserService);
        serviceProvider.GetService(typeof(IEmailService)).Returns(emailService);
        serviceProvider.GetService(typeof(IExceptionHandler)).Returns(scopedExceptionHandler);
        serviceProvider.GetService(typeof(IOnboardingRequestService)).Returns(scopedOnboardingRequestService);

        var scope = Substitute.For<IServiceScope>();
        scope.ServiceProvider.Returns(serviceProvider);

        var serviceScopeFactory = Substitute.For<IServiceScopeFactory>();
        serviceScopeFactory.CreateScope().Returns(scope);

        var service = new OnboardingRequestService(repository, realtimeService, serviceScopeFactory);
        var siteRoot = new Uri("http://localhost:5000");

        string requestId = await service.SubmitOnboardingRequestAsync(
            UserId,
            ProjectId,
            new OnboardingRequestFormData(),
            siteRoot
        );

        // The email is sent on a fire-and-forget task; wait up to 5 seconds for it to complete
        await emailSentTcs.Task.WaitAsync(TimeSpan.FromSeconds(5));

        string link = $"{siteRoot}/serval-administration/onboarding-requests/{requestId}";
        string expectedBody =
            "\n"
            + "                    <p>A new onboarding request has been submitted for the project <strong>&lt;b&gt;P01&lt;/b&gt; - &lt;script&gt;alert(1)&lt;/script&gt;</strong>.</p>\n"
            + "                    <p><strong>Submitted by:</strong> &lt;img src=x onerror=alert(1)&gt;</p>\n"
            + $"                    <p><strong>Submission Time:</strong> {capturedRequest!.Submission.Timestamp:u}</p>\n"
            + $"                    <p>The request can be viewed at <a href=\"{link}\">{link}</a></p>\n"
            + "                ";
        // Subject uses ShortName as plain text (not HTML), so it is not encoded
        const string expectedSubject = "Onboarding request for <b>P01</b>";
        await emailService
            .Received(1)
            .SendEmailAsync(AdminEmail, expectedSubject, expectedBody, CancellationToken.None);
    }
}
