using System.IO;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;

namespace SIL.XForge.Services
{
    [TestFixture]
    public class ProjectServiceTests
    {
        private const string Project01 = "project01";
        private const string Project02 = "project02";
        private const string User01 = "user01";
        private const string User02 = "user02";
        private const string User03 = "user03";
        private const string SiteId = "xf";

        [Test]
        public async Task SaveAudioAsync_NonMp3File_AudioConverted()
        {
            var env = new TestEnvironment();
            const string dataId = "507f1f77bcf86cd799439011";
            string filePath = Path.Combine("site", "audio", Project01, $"{User01}_{dataId}.mp3");
            env.FileSystemService.OpenFile(Arg.Any<string>(), FileMode.Create).Returns(new MemoryStream());
            env.FileSystemService.FileExists(filePath).Returns(true);

            var stream = new MemoryStream();
            Uri uri = await env.Service.SaveAudioAsync(User01, Project01, dataId, ".wav", stream);
            Assert.That(uri.ToString().StartsWith($"http://localhost/assets/audio/project01/user01_{dataId}.mp3?t="),
                Is.True);
            await env.AudioService.Received().ConvertToMp3Async(Arg.Any<string>(), filePath);
        }

        [Test]
        public async Task SaveAudioAsync_Mp3File_AudioSaved()
        {
            var env = new TestEnvironment();
            const string dataId = "507f1f77bcf86cd799439011";
            string filePath = Path.Combine("site", "audio", Project01, $"{User01}_{dataId}.mp3");
            env.FileSystemService.OpenFile(Arg.Any<string>(), FileMode.Create).Returns(new MemoryStream());
            env.FileSystemService.FileExists(filePath).Returns(true);

            var stream = new MemoryStream();
            Uri uri = await env.Service.SaveAudioAsync(User01, Project01, dataId, ".mp3", stream);
            Assert.That(uri.ToString().StartsWith($"http://localhost/assets/audio/project01/user01_{dataId}.mp3?t="),
                Is.True);
            env.FileSystemService.Received().OpenFile(filePath, FileMode.Create);
            await env.AudioService.DidNotReceive().ConvertToMp3Async(Arg.Any<string>(), filePath);
        }

        [Test]
        public void SaveAudioAsync_InvalidDataId_FormatError()
        {
            var env = new TestEnvironment();

            var stream = new MemoryStream();
            Assert.ThrowsAsync<FormatException>(() => env.Service.SaveAudioAsync(User01, Project01, "/../test/abc.txt",
                ".wav", stream));
        }

        [Test]
        public void SaveAudioAsync_InvalidProjectId_NotFoundError()
        {
            var env = new TestEnvironment();

            var stream = new MemoryStream();
            Assert.ThrowsAsync<DataNotFoundException>(() => env.Service.SaveAudioAsync(User01, "/../abc.txt",
                "507f1f77bcf86cd799439011", ".wav", stream));
        }

        [Test]
        public async Task DeleteAudioAsync_NonAdminUser_FileDeleted()
        {
            var env = new TestEnvironment();
            const string dataId = "507f1f77bcf86cd799439011";
            string filePath = Path.Combine("site", "audio", Project01, $"{User02}_{dataId}.mp3");
            env.FileSystemService.FileExists(filePath).Returns(true);

            await env.Service.DeleteAudioAsync(User02, Project01, User02, dataId);
            env.FileSystemService.Received().DeleteFile(filePath);
        }

        [Test]
        public async Task DeleteAudioAsync_AdminUser_FileDeleted()
        {
            var env = new TestEnvironment();
            const string dataId = "507f1f77bcf86cd799439011";
            string filePath = Path.Combine("site", "audio", Project01, $"{User02}_{dataId}.mp3");
            env.FileSystemService.FileExists(filePath).Returns(true);

            await env.Service.DeleteAudioAsync(User01, Project01, User02, dataId);
            env.FileSystemService.Received().DeleteFile(filePath);
        }

        [Test]
        public void DeleteAudioAsync_NotOwner_ForbiddenError()
        {
            var env = new TestEnvironment();
            const string dataId = "507f1f77bcf86cd799439011";
            string filePath = Path.Combine("site", "audio", Project01, $"{User01}_{dataId}.mp3");
            env.FileSystemService.FileExists(filePath).Returns(true);

            Assert.ThrowsAsync<ForbiddenException>(() =>
                env.Service.DeleteAudioAsync(User02, Project01, User01, dataId));
        }

        [Test]
        public void DeleteAudioAsync_InvalidDataId_FormatError()
        {
            var env = new TestEnvironment();

            Assert.ThrowsAsync<FormatException>(() =>
                env.Service.DeleteAudioAsync(User02, Project01, User01, "/../test/abc.txt"));
        }

        [Test]
        public void DeleteAudioAsync_InvalidProjectId_NotFoundError()
        {
            var env = new TestEnvironment();

            Assert.ThrowsAsync<DataNotFoundException>(() =>
                env.Service.DeleteAudioAsync(User02, "/../test/abc.txt", User01, "507f1f77bcf86cd799439011"));
        }

        [Test]
        public async Task UpdateRoleAsync_SystemAdmin_RoleUpdated()
        {
            var env = new TestEnvironment();

            await env.Service.UpdateRoleAsync(User02, SystemRole.SystemAdmin, Project01, TestProjectRole.Administrator);
            TestProject project = env.GetProject(Project01);
            Assert.That(project.UserRoles[User02], Is.EqualTo(TestProjectRole.Administrator));
        }

        [Test]
        public void UpdateRoleAsync_NormalUser_ForbiddenError()
        {
            var env = new TestEnvironment();

            Assert.ThrowsAsync<ForbiddenException>(() =>
                env.Service.UpdateRoleAsync(User02, SystemRole.User, Project01, TestProjectRole.Administrator));
        }

        [Test]
        public void SetSyncDisabled_RequiresSysAdmin()
        {
            var env = new TestEnvironment();
            // SUT 1
            Assert.ThrowsAsync<ForbiddenException>(async () =>
                await env.Service.SetSyncDisabledAsync(User03, SystemRole.User, Project01, false));
            // SUT 2
            Assert.ThrowsAsync<ForbiddenException>(async () =>
                await env.Service.SetSyncDisabledAsync(User03, SystemRole.None, Project01, false));
            // SUT 3
            Assert.DoesNotThrowAsync(async () =>
                await env.Service.SetSyncDisabledAsync(User03, SystemRole.SystemAdmin, Project01, false));
        }

        [Test]
        public async Task SetSyncDisabled_Works()
        {
            var env = new TestEnvironment();

            Assert.That(env.GetProject(Project01).SyncDisabled, Is.EqualTo(false));
            // SUT 1
            await env.Service.SetSyncDisabledAsync(User01, SystemRole.SystemAdmin, Project01, true);
            Assert.That(env.GetProject(Project01).SyncDisabled, Is.EqualTo(true));

            Assert.That(env.GetProject(Project02).SyncDisabled, Is.EqualTo(true));
            // SUT 2
            await env.Service.SetSyncDisabledAsync(User01, SystemRole.SystemAdmin, Project02, false);
            Assert.That(env.GetProject(Project02).SyncDisabled, Is.EqualTo(false));
        }

        [Test]
        public void RemoveUserFromProjectAsync_BadArguments()
        {
            var env = new TestEnvironment();
            IConnection connection = Substitute.For<IConnection>();
            IDocument<TestProject> projectDoc = Substitute.For<IDocument<TestProject>>();
            IDocument<User> userDoc = Substitute.For<IDocument<User>>();
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.RemoveUserFromProjectAsync(null, projectDoc, userDoc));
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.RemoveUserFromProjectAsync(connection, null, userDoc));
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.RemoveUserFromProjectAsync(connection, projectDoc, null));
        }

        [Test]
        public void RemoveUserAsync_BadArguments()
        {
            var env = new TestEnvironment();
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.RemoveUserAsync(null, "projectId", "projectUserId"));
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.RemoveUserAsync("curUserId", null, "projectUserId"));
            Assert.ThrowsAsync<ArgumentNullException>(() => env.Service.RemoveUserAsync("curUserId", "projectId", null));
        }

        [Test]
        public async Task RemoveUserAsync_DisassociatesUserAndProject()
        {
            var env = new TestEnvironment();
            Assert.That(env.GetProject(Project01).UserRoles, Does.ContainKey(User02), "setup");
            Assert.That(env.GetUser(User02).Sites[SiteId].Projects, Does.Contain(Project01), "setup");
            // SUT
            await env.Service.RemoveUserAsync(User01, Project01, User02);
            Assert.That(env.GetProject(Project01).UserRoles, Does.Not.ContainKey(User02));
            Assert.That(env.GetUser(User02).Sites[SiteId].Projects, Does.Not.Contain(Project01));
        }

        private class TestEnvironment
        {
            public TestEnvironment(bool isResetLinkExpired = false)
            {
                RealtimeService = new MemoryRealtimeService();
                RealtimeService.AddRepository("users", OTType.Json0,
                    new MemoryRepository<User>(new[]
                    {
                        new User
                        {
                            Id = User01,
                            Email = "user01@example.com",
                            Sites = new Dictionary<string, Site>
                            {
                                { SiteId, new Site()
                                    {
                                        Projects = new List<String>()
                                        {
                                            Project01,
                                            Project02
                                        }
                                    }
                                }
                            }
                        },
                        new User
                        {
                            Id = User02,
                            Email = "user02@example.com",
                            Sites = new Dictionary<string, Site>
                            {
                                { SiteId, new Site()
                                    {
                                        Projects = new List<String>()
                                        {
                                            Project01,
                                            Project02
                                        }
                                    }
                                }
                            }
                        },
                        new User
                        {
                            Id = User03,
                            Email = "user03@example.com",
                            Sites = new Dictionary<string, Site> { { SiteId, new Site() } }
                        }
                    }));
                RealtimeService.AddRepository("projects", OTType.Json0,
                    new MemoryRepository<TestProject>(new[]
                    {
                        new TestProject
                        {
                            Id = Project01,
                            Name = "Project 1",
                            UserRoles =
                            {
                                { User01, TestProjectRole.Administrator },
                                { User02, TestProjectRole.Reviewer }
                            }
                        },
                        new TestProject
                        {
                            Id = Project02,
                            Name = "Project 2",
                            UserRoles =
                            {
                                { User01, TestProjectRole.Administrator },
                                { User02, TestProjectRole.Reviewer }
                            },
                            SyncDisabled = true
                        },
                    }));

                var siteOptions = Substitute.For<IOptions<SiteOptions>>();
                siteOptions.Value.Returns(new SiteOptions
                {
                    Id = SiteId,
                    Name = "xForge",
                    Origin = new Uri("http://localhost"),
                    SiteDir = "site"
                });
                AudioService = Substitute.For<IAudioService>();

                ProjectSecrets = new MemoryRepository<TestProjectSecret>(new[]
                {
                    new TestProjectSecret { Id = Project01 }
                });

                FileSystemService = Substitute.For<IFileSystemService>();

                Service = new TestProjectService(RealtimeService, siteOptions, AudioService, ProjectSecrets,
                    FileSystemService);
            }

            public TestProjectService Service { get; }
            public MemoryRealtimeService RealtimeService { get; }
            public MemoryRepository<TestProjectSecret> ProjectSecrets { get; }
            public IFileSystemService FileSystemService { get; }
            public IAudioService AudioService { get; }

            public TestProject GetProject(string id)
            {
                return RealtimeService.GetRepository<TestProject>().Get(id);
            }

            public User GetUser(string id)
            {
                return RealtimeService.GetRepository<User>().Get(id);
            }
        }
    }
}
