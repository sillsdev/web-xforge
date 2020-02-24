using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
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

        private class TestEnvironment
        {
            public TestEnvironment()
            { }
        }
    }
}
