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
using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.XPath;
using IdentityModel;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using Paratext.Data;
using Paratext.Data.Encodings;
using Paratext.Data.Languages;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using PtxUtils;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;
using Paratext.Base;

namespace SIL.XForge.Scripture.Services
{
    [TestFixture]
    public class ParatextServiceTests
    {
        [Test]
        public void Foo_Foo()
        {
            var env = new TestEnvironment();
            Assert.True(true);
        }

        [Test]
        public async Task GetProjectsAsync_ReturnCorrectNumberOfRepos()
        {
            var env = new TestEnvironment();
            env.Service._jwt = "token1234";
            IInternetSharedRepositorySource mockInternetSharedRepositorySource = Substitute.For<IInternetSharedRepositorySource>();
            var list = new List<SharedRepository>();
            list.Add(new SharedRepository());
            list.Add(new SharedRepository());

            mockInternetSharedRepositorySource.GetRepositories().Returns(list);
            IEnumerable<SharedRepository> ret = env.Service.GetListOfProjects2(mockInternetSharedRepositorySource);
            var repos = ret;
            Assert.That(repos.Count(), Is.EqualTo(2));
            // Assert.True(true);
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
            Assert.That(result.Contains("<book"));
        }

        private class TestEnvironment
        {
            public IHostingEnvironment MockHostingEnvironment;
            public IOptions<ParatextOptions> MockParatextOptions;
            public IRepository<UserSecret> MockRepository;
            public IRealtimeService MockRealtimeService;
            public IExceptionHandler MockExceptionHandler;
            public IOptions<SiteOptions> MockSiteOptions;
            public IFileSystemService MockFileSystemService;
            public IScrTextCollectionRunner MockedScrTextCollectionRunner;


            public ParatextService Service;

            public TestEnvironment()
            {
                MockHostingEnvironment = Substitute.For<IHostingEnvironment>();
                MockParatextOptions = Substitute.For<IOptions<ParatextOptions>>();
                MockRepository = Substitute.For<IRepository<UserSecret>>();
                MockRealtimeService = Substitute.For<IRealtimeService>();
                MockExceptionHandler = Substitute.For<IExceptionHandler>();
                MockSiteOptions = Substitute.For<IOptions<SiteOptions>>();
                MockFileSystemService = Substitute.For<IFileSystemService>();
                MockedScrTextCollectionRunner = Substitute.For<IScrTextCollectionRunner>();
                // MockInternetSharedRepositorySource = Substitute.For<IInternetSharedRepositorySource>();


                //Mock=Substitute.For<>();
                //Mock=Substitute.For<>();
                Service = new ParatextService(MockHostingEnvironment, MockParatextOptions, MockRepository, MockRealtimeService, MockExceptionHandler, MockSiteOptions, MockFileSystemService);
                Service._scrTextCollectionRunner = MockedScrTextCollectionRunner;
            }
        }
    }
}
