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
        public async Task GetProjectsAsync_Works()
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
            Assert.True(true);
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
                // MockInternetSharedRepositorySource = Substitute.For<IInternetSharedRepositorySource>();


                //Mock=Substitute.For<>();
                //Mock=Substitute.For<>();
                Service = new ParatextService(MockHostingEnvironment, MockParatextOptions, MockRepository, MockRealtimeService, MockExceptionHandler, MockSiteOptions, MockFileSystemService);
            }
        }
    }
}
