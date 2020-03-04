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
        private const string Project01 = "project01";
        private const string Project02 = "project02";
        private const string Project03 = "project03";
        private const string User01 = "user01";
        private const string User02 = "user02";

        [Test]
        public async Task GetListOfProjects_ReturnCorrectNumberOfRepos()
        {
            var env = new TestEnvironment();
            UserSecret userSecret = env.SetUserSecret();
            env.SetSharedRepositorySource(userSecret);
            env.AddProjectRepository();
            RegistryU.Implementation = new DotNetCoreRegistry();

            IEnumerable<ParatextProject> repos = await env.Service.GetProjectsAsync(userSecret);
            Assert.That(repos.Count(), Is.EqualTo(3));
        }

        [Test]
        public async Task GetProjectsAsync_ShowsProjectsAvailable()
        {
            var env = new TestEnvironment();
            UserSecret userSecret = env.SetUserSecret();
            env.SetSharedRepositorySource(userSecret);
            env.AddProjectRepository();

            // TODO: Not yet implemented
            // var result = await env.Service.GetProjectsAsync(userSecret);
            // string paratextId = "paratext_" + Project01;
            // Assert.That(result.Single(p => p.ParatextId == paratextId), Is.Not.Null);
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
            }

            public UserSecret SetUserSecret()
            {
                var userSecret = new UserSecret();
                userSecret.Id = "User01";
                var ptToken = new Tokens
                {
                    AccessToken = "eyJhbGciOiJSUzI1NiJ9.eyJzY29wZXMiOlsiZGF0YV9hY2Nlc3MiLCJlbWFpbCIsIm9mZmxpbmVfYWNjZXNzIiwib3BlbmlkIiwicHJvamVjdHMubWVtYmVyczpyZWFkIiwicHJvamVjdHMubWVtYmVyczp3cml0ZSIsInByb2plY3RzOnJlYWQiXSwiaWF0IjoxNTgzMTkzMjg4LCJqdGkiOiIzeTZzYkZOS2cycThob2ZzUSIsImF1ZCI6WyJodHRwczovL3JlZ2lzdHJ5LWRldi5wYXJhdGV4dC5vcmciLCJodHRwczovL2RhdGEtYWNjZXNzLWRldi5wYXJhdGV4dC5vcmciLCJodHRwczovL2FyY2hpdmVzLWRldi5wYXJhdGV4dC5vcmciXSwic3ViIjoiZ0hUcHVuRWIzWkNEcW1xVEsiLCJleHAiOjE1ODMxOTQ0ODgsImF6cCI6IkRiRERwN25BZFBZdHVKTDlMIiwidXNlcm5hbWUiOiJSYXltb25kIEx1b25nIiwiaXNzIjoicHRyZWdfcnNhIn0.B0JvNb5sJwc3wSvAI5zOq3_3OghimNmfVFn0axGFBXHhT5BMHaOjdrfJJGNEQZO3aA3v83vou8n2sM_6zcnxiixCGnr_cmyl62bJjma0HHFX47Ms30TQQaDjiTON50czG7fqiKyGRtBbagjlkT8ulRjeoJbUtK-I3aIHmn6-FNZn4DdfbgznMtav8DP3m9r0L4pfyloOEH4Z3If5OTn9xfokP-bJtgoxrLOspzOfZaU6wqH-8uy7imAmhfBwpZxDwnqP1KHLXgpQB1SbCrrIhv82x66D6iL_5VP1laPjlc3zTk29ilE_HW0F1eIzrjDaMhYsTHQE2M6noCsKPrni6Q",
                    RefreshToken = "3y6sbFNKg2q8hofsQ:7oJNRdrSd-vUxBHGYQiCPeDUsGHnGhuxtKnrHRcVBZ2"
                };
                // ptToken.AccessToken = "eyJhbGciOiJSUzI1NiJ9.eyJzY29wZXMiOlsiZGF0YV9hY2Nlc3MiLCJlbWFpbCIsIm9mZmxpbmVfYWNjZXNzIiwib3BlbmlkIiwicHJvamVjdHMubWVtYmVyczpyZWFkIiwicHJvamVjdHMubWVtYmVyczp3cml0ZSIsInByb2plY3RzOnJlYWQiXSwiaWF0IjoxNTgzMTkzMjg4LCJqdGkiOiIzeTZzYkZOS2cycThob2ZzUSIsImF1ZCI6WyJodHRwczovL3JlZ2lzdHJ5LWRldi5wYXJhdGV4dC5vcmciLCJodHRwczovL2RhdGEtYWNjZXNzLWRldi5wYXJhdGV4dC5vcmciLCJodHRwczovL2FyY2hpdmVzLWRldi5wYXJhdGV4dC5vcmciXSwic3ViIjoiZ0hUcHVuRWIzWkNEcW1xVEsiLCJleHAiOjE1ODMxOTQ0ODgsImF6cCI6IkRiRERwN25BZFBZdHVKTDlMIiwidXNlcm5hbWUiOiJSYXltb25kIEx1b25nIiwiaXNzIjoicHRyZWdfcnNhIn0.B0JvNb5sJwc3wSvAI5zOq3_3OghimNmfVFn0axGFBXHhT5BMHaOjdrfJJGNEQZO3aA3v83vou8n2sM_6zcnxiixCGnr_cmyl62bJjma0HHFX47Ms30TQQaDjiTON50czG7fqiKyGRtBbagjlkT8ulRjeoJbUtK-I3aIHmn6-FNZn4DdfbgznMtav8DP3m9r0L4pfyloOEH4Z3If5OTn9xfokP-bJtgoxrLOspzOfZaU6wqH-8uy7imAmhfBwpZxDwnqP1KHLXgpQB1SbCrrIhv82x66D6iL_5VP1laPjlc3zTk29ilE_HW0F1eIzrjDaMhYsTHQE2M6noCsKPrni6Q";
                userSecret.ParatextTokens = ptToken;
                return userSecret;
            }

            public IInternetSharedRepositorySource SetSharedRepositorySource(UserSecret userSecret)
            {
                PermissionManager sourceUsers = Substitute.For<PermissionManager>();
                sourceUsers.GetRole(Arg.Any<string>()).Returns(UserRoles.Administrator);
                IInternetSharedRepositorySource mockSource = Substitute.For<IInternetSharedRepositorySource>();
                SharedRepository repo1 = new SharedRepository
                {
                    SendReceiveId = "paratext_" + Project01,
                    ScrTextName = Project01,
                    SourceUsers = sourceUsers
                };
                SharedRepository repo2 = new SharedRepository
                {
                    SendReceiveId = "paratext_" + Project02,
                    ScrTextName = Project02,
                    SourceUsers = sourceUsers
                };
                SharedRepository repo3 = new SharedRepository
                {
                    SendReceiveId = "paratext_" + Project03,
                    ScrTextName = Project03,
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
                            Id = Project01,
                            ParatextId = "paratext_" + Project01,
                            Name = "project01",
                            ShortName = "P01",
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
