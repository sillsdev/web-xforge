using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using SIL.Machine.WebApi.Services;
using SIL.Scripture;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.RichText;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Realtime;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security;
using System.Security.Claims;
using System.Text;
using System.Xml;
using System.Xml.XPath;
using IdentityModel;
using Newtonsoft.Json.Linq;
using Paratext.Data;
using Paratext.Data.Encodings;
using Paratext.Data.Languages;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using PtxUtils;
using SIL.ObjectModel;
using SIL.XForge.Services;
using SIL.XForge.Utils;
using Paratext.Base;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class ParatextServiceTests
    {
        [Test]
        public void GetProjectsAsync_BadArguments()
        {
            var env = new TestEnvironment();
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.GetProjectsAsync(null));
        }

        [Test]
        public async Task GetProjectsAsync_ReturnCorrectRepos()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01);
            env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);

            // SUT
            IEnumerable<ParatextProject> repos = await env.Service.GetProjectsAsync(user01Secret);

            // Right number of repos returned.
            Assert.That(repos.Count(), Is.EqualTo(3));

            // Repos returned are the ones we expect.
            // TODO make ones that shouldnt be there .
            foreach (string projectName in new string[] { env.Project01, env.Project02, env.Project03 })
            {
                Assert.That(repos.Single(project => project.ParatextId == "paratext_" + projectName), Is.Not.Null);
            }

            // Properties of one of the returned repos have the correct values.
            ParatextProject expectedProject01 = new ParatextProject
            {
                ParatextId = "paratext_" + env.Project01,
                Name = env.Project01,
                ShortName = "P01",
                LanguageTag = "writingsystem_tag",
                SFProjectId = "sf_id_" + env.Project01,
                // Not connectable since sf project exists and sf user is on sf project.
                IsConnectable = false,
                // Is connected since is in SF database and user is on project
                IsConnected = true
            };
            Assert.That(repos.Single(project => project.ParatextId == "paratext_" + env.Project01).ExpressiveToString(), Is.EqualTo(expectedProject01.ExpressiveToString()));

        }

        [Test]
        public async Task GetProjectsAsync_ConnectedConnectable()
        {
            var env = new TestEnvironment();
            UserSecret user01Secret = env.MakeUserSecret(env.User01);
            env.SetSharedRepositorySource(user01Secret, UserRoles.Administrator);
            UserSecret user03Secret = env.MakeUserSecret(env.User03);
            env.SetSharedRepositorySource(user03Secret, UserRoles.TeamMember);

            // Check resulting IsConnectable and IsConnected values across various scenarios of SF project existing, SF user being a member of the SF project, and PT user being an admin on PT project.

            var testCases = new[]
            {
                new
                {
                    // Data
                    paratextProjectId = "paratext_" + env.Project01,
                    sfUserId = env.User01,
                    ptUsername = "user 01",
                    userSecret = user01Secret,
                    // Environmental assumptions
                    sfProjectExists = true,
                    sfUserIsOnSfProject = true,
                    ptUserIsAdminOnPtProject = true,
                    // Expectation to assert
                    isConnected = true,
                    reason1 = "sf project exists and sf user is member of the sf project",
                    isConnectable = false,
                    reason2 = "can not re-connect to project"
                },
                new
                {
                    paratextProjectId = "paratext_" + env.Project01,
                    sfUserId = env.User03,
                    ptUsername = "user 01",
                    userSecret = user03Secret,

                    sfProjectExists = true,
                    sfUserIsOnSfProject = false,
                    ptUserIsAdminOnPtProject = false,

                    isConnected = false,
                    reason1 = "sf project exists and but sf user is not member of the sf project",
                    isConnectable = true,
                    reason2 = "can connect to existing SF project"
                },
                new
                {
                    paratextProjectId = "paratext_" + env.Project02,
                    sfUserId = env.User01,
                    ptUsername = "user 01",
                    userSecret = user01Secret,

                    sfProjectExists = false,
                    sfUserIsOnSfProject = false,
                    ptUserIsAdminOnPtProject = true,

                    isConnected = false,
                    reason1 = "sf project does not exist",
                    isConnectable = true,
                    reason2 = "pt admin can start connection to not-yet-existing sf project"
                },
                new
                {
                    paratextProjectId = "paratext_" + env.Project02,
                    sfUserId = env.User03,
                    ptUsername = "user 03",
                    userSecret = user03Secret,

                    sfProjectExists = false,
                    sfUserIsOnSfProject = false,
                    ptUserIsAdminOnPtProject = false,

                    isConnected = false,
                    reason1 = "sf project does not exist",
                    isConnectable = false,
                    reason2 = "pt non-admin can not start connection to not-yet-existing sf project"
                },
            };

            foreach (var testCase in testCases)
            {
                // Check that assumptions are true.
                Assert.That((await env.RealtimeService.GetRepository<SFProject>().GetAllAsync()).Any(sfProject => sfProject.ParatextId == testCase.paratextProjectId), Is.EqualTo(testCase.sfProjectExists), "not set up - whether sf project exists or not");
                if (testCase.sfProjectExists)
                {
                    Assert.That((await env.RealtimeService.GetRepository<SFProject>().GetAllAsync()).Single(sfProject => sfProject.ParatextId == testCase.paratextProjectId).UserRoles.ContainsKey(testCase.sfUserId), Is.EqualTo(testCase.sfUserIsOnSfProject), "not set up - whether user is on existing sf project or not");
                }
                Assert.That(env.Service._internetSharedRepositorySource[testCase.sfUserId]
                    .GetRepositories()
                    .FirstOrDefault(sharedRepository => sharedRepository.SendReceiveId == testCase.paratextProjectId)
                    .SourceUsers
                    .GetRole(testCase.ptUsername) == UserRoles.Administrator, Is.EqualTo(testCase.ptUserIsAdminOnPtProject), "not set up - whether pt user is an admin on pt project");

                // SUT
                ParatextProject resultingProjectToExamine = (await env.Service.GetProjectsAsync(testCase.userSecret)).Single(project => project.ParatextId == testCase.paratextProjectId);

                // Assert expectations.
                Assert.That(resultingProjectToExamine.IsConnected, Is.EqualTo(testCase.isConnected), testCase.reason1);
                Assert.That(resultingProjectToExamine.IsConnectable, Is.EqualTo(testCase.isConnectable), testCase.reason2);
            }
        }

        [Test]
        public async Task GetBooks_ReturnCorrectNumberOfBooks()
        {
            var env = new TestEnvironment();
            MockScrText paratextProject = new MockScrText();
            // Books 1 thru 3.
            paratextProject.Settings.BooksPresentSet = new BookSet(1, 3);
            string paratextProjectId = "ptId123";
            env.MockedScrTextCollectionRunner.FindById(paratextProjectId).Returns(paratextProject);

            IReadOnlyList<int> result = env.Service.GetBooks(paratextProjectId);
            Assert.That(result.Count(), Is.EqualTo(3));
            Assert.That(result, Is.EquivalentTo(new[] { 1, 2, 3 }));
        }

        [Test]
        public async Task GetBookText_Works()
        {
            string paratextProjectId = "ptId123";
            string ruthBookUsfm = "\\id RUT - ProjectNameHere\n" +
            "\\c 1\n" +
            "\\v 1 Verse 1 here.\n" +
            "\\v 2 Verse 2 here.";
            string ruthBookUsx = "<usx version=\"3.0\">\r\n  <book code=\"RUT\" style=\"id\">- ProjectNameHere</book>\r\n  <chapter number=\"1\" style=\"c\" />\r\n  <verse number=\"1\" style=\"v\" />Verse 1 here. <verse number=\"2\" style=\"v\" />Verse 2 here.</usx>";

            MockScrText paratextProject = new MockScrText();
            paratextProject.Data.Add("RUT", ruthBookUsfm);
            var env = new TestEnvironment();
            env.MockedScrTextCollectionRunner.FindById(paratextProjectId).Returns(paratextProject);
            env.MockedScrTextCollectionRunner.GetById(paratextProjectId).Returns(paratextProject);
            string result = env.Service.GetBookText(null, paratextProjectId, 8);
            Assert.That(result, Is.EqualTo(ruthBookUsx));
        }

        private class TestEnvironment
        {
            public readonly string Project01 = "project01";
            public readonly string Project02 = "project02";
            public readonly string Project03 = "project03";
            public readonly string User01 = "user01";
            public readonly string User02 = "user02";
            public readonly string User03 = "user03";

            public IHostingEnvironment MockHostingEnvironment;
            public IOptions<ParatextOptions> MockParatextOptions;
            public IRepository<UserSecret> MockRepository;
            public SFMemoryRealtimeService RealtimeService;
            public IExceptionHandler MockExceptionHandler;
            public IOptions<SiteOptions> MockSiteOptions;
            public IFileSystemService MockFileSystemService;
            public IScrTextCollectionRunner MockedScrTextCollectionRunner;


            public ParatextService Service;

            public readonly UserSecret userSecret;

            public TestEnvironment()
            {
                MockHostingEnvironment = Substitute.For<IHostingEnvironment>();
                MockParatextOptions = Substitute.For<IOptions<ParatextOptions>>();
                MockRepository = Substitute.For<IRepository<UserSecret>>();
                MockExceptionHandler = Substitute.For<IExceptionHandler>();
                MockSiteOptions = Substitute.For<IOptions<SiteOptions>>();
                MockFileSystemService = Substitute.For<IFileSystemService>();
                MockedScrTextCollectionRunner = Substitute.For<IScrTextCollectionRunner>();
                // MockInternetSharedRepositorySource = Substitute.For<IInternetSharedRepositorySource>();

                RealtimeService = new SFMemoryRealtimeService();

                //Mock=Substitute.For<>();
                //Mock=Substitute.For<>();
                Service = new ParatextService(MockHostingEnvironment, MockParatextOptions, MockRepository, RealtimeService, MockExceptionHandler, MockSiteOptions, MockFileSystemService);
                Service._scrTextCollectionRunner = MockedScrTextCollectionRunner;

                AddProjectRepository();
            }

            public UserSecret MakeUserSecret(string userSecretId)
            {
                var userSecret = new UserSecret();
                userSecret.Id = userSecretId;
                var ptToken = new Tokens
                {
                    AccessToken = "access_token_1234",
                    RefreshToken = "refresh_token_1234"
                };
                // ptToken.AccessToken = "eyJhbGciOiJSUzI1NiJ9.eyJzY29wZXMiOlsiZGF0YV9hY2Nlc3MiLCJlbWFpbCIsIm9mZmxpbmVfYWNjZXNzIiwib3BlbmlkIiwicHJvamVjdHMubWVtYmVyczpyZWFkIiwicHJvamVjdHMubWVtYmVyczp3cml0ZSIsInByb2plY3RzOnJlYWQiXSwiaWF0IjoxNTgzMTkzMjg4LCJqdGkiOiIzeTZzYkZOS2cycThob2ZzUSIsImF1ZCI6WyJodHRwczovL3JlZ2lzdHJ5LWRldi5wYXJhdGV4dC5vcmciLCJodHRwczovL2RhdGEtYWNjZXNzLWRldi5wYXJhdGV4dC5vcmciLCJodHRwczovL2FyY2hpdmVzLWRldi5wYXJhdGV4dC5vcmciXSwic3ViIjoiZ0hUcHVuRWIzWkNEcW1xVEsiLCJleHAiOjE1ODMxOTQ0ODgsImF6cCI6IkRiRERwN25BZFBZdHVKTDlMIiwidXNlcm5hbWUiOiJSYXltb25kIEx1b25nIiwiaXNzIjoicHRyZWdfcnNhIn0.B0JvNb5sJwc3wSvAI5zOq3_3OghimNmfVFn0axGFBXHhT5BMHaOjdrfJJGNEQZO3aA3v83vou8n2sM_6zcnxiixCGnr_cmyl62bJjma0HHFX47Ms30TQQaDjiTON50czG7fqiKyGRtBbagjlkT8ulRjeoJbUtK-I3aIHmn6-FNZn4DdfbgznMtav8DP3m9r0L4pfyloOEH4Z3If5OTn9xfokP-bJtgoxrLOspzOfZaU6wqH-8uy7imAmhfBwpZxDwnqP1KHLXgpQB1SbCrrIhv82x66D6iL_5VP1laPjlc3zTk29ilE_HW0F1eIzrjDaMhYsTHQE2M6noCsKPrni6Q";
                userSecret.ParatextTokens = ptToken;
                return userSecret;
            }

            public IInternetSharedRepositorySource SetSharedRepositorySource(UserSecret userSecret, UserRoles userRoleOnAllThePtProjects)
            {
                PermissionManager sourceUsers = Substitute.For<PermissionManager>();
                sourceUsers.GetRole(Arg.Any<string>()).Returns(userRoleOnAllThePtProjects);
                IInternetSharedRepositorySource mockSource = Substitute.For<IInternetSharedRepositorySource>();
                SharedRepository repo1 = new SharedRepository
                {
                    SendReceiveId = "paratext_" + Project01,
                    ScrTextName = "P01",
                    SourceUsers = sourceUsers
                };
                SharedRepository repo2 = new SharedRepository
                {
                    SendReceiveId = "paratext_" + Project02,
                    ScrTextName = "P02",
                    SourceUsers = sourceUsers
                };
                SharedRepository repo3 = new SharedRepository
                {
                    SendReceiveId = "paratext_" + Project03,
                    ScrTextName = "P03",
                    SourceUsers = sourceUsers
                };
                mockSource.GetRepositories().Returns(new List<SharedRepository> { repo1, repo2, repo3 });
                Service._internetSharedRepositorySource[userSecret.Id] = mockSource;
                return mockSource;
            }

            public void AddProjectRepository()
            {
                RealtimeService.AddRepository("sf_projects", OTType.Json0, new MemoryRepository<SFProject>(
                    new[]
                    {
                        new SFProject
                        {
                            Id = "sf_id_"+Project01,
                            ParatextId = "paratext_" + Project01,
                            Name = "project01",
                            ShortName = "P01",
                            WritingSystem = new WritingSystem
                            {
                                Tag = "writingsystem_tag"
                            },
                            TranslateConfig = new TranslateConfig
                            {
                                TranslationSuggestionsEnabled = true,
                                Source = new TranslateSource
                                {
                                    ParatextId = "paratextId",
                                    Name = "Source",
                                    ShortName = "SRC",
                                    WritingSystem = new WritingSystem
                                    {
                                        Tag = "qaa"
                                    }
                                }
                            },
                            CheckingConfig = new CheckingConfig
                            {
                                ShareEnabled = false
                            },
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
                                    Chapters = { new Chapter { Number = 1, LastVerse = 3, IsValid = true } }
                                },
                                new TextInfo
                                {
                                    BookNum = 41,
                                    Chapters =
                                    {
                                        new Chapter { Number = 1, LastVerse = 3, IsValid = true },
                                        new Chapter { Number = 2, LastVerse = 3, IsValid = true }
                                    }
                                }
                            }
                        },
                    }));
            }
        }
    }
}
