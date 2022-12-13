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

            using var stream = new MemoryStream();
            Uri uri = await env.Service.SaveAudioAsync(User01, Project01, dataId, ".wav", stream);
            Assert.That(
                uri.ToString().StartsWith($"http://localhost/assets/audio/project01/user01_{dataId}.mp3?t="),
                Is.True
            );
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

            using var stream = new MemoryStream();
            Uri uri = await env.Service.SaveAudioAsync(User01, Project01, dataId, ".mp3", stream);
            Assert.That(
                uri.ToString().StartsWith($"http://localhost/assets/audio/project01/user01_{dataId}.mp3?t="),
                Is.True
            );
            env.FileSystemService.Received().OpenFile(filePath, FileMode.Create);
            await env.AudioService.DidNotReceive().ConvertToMp3Async(Arg.Any<string>(), filePath);
        }

        [Test]
        public void SaveAudioAsync_InvalidDataId_FormatError()
        {
            var env = new TestEnvironment();

            using var stream = new MemoryStream();
            Assert.ThrowsAsync<FormatException>(
                () => env.Service.SaveAudioAsync(User01, Project01, "/../test/abc.txt", ".wav", stream)
            );
        }

        [Test]
        public void SaveAudioAsync_InvalidProjectId_NotFoundError()
        {
            var env = new TestEnvironment();

            using var stream = new MemoryStream();
            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.SaveAudioAsync(User01, "/../abc.txt", "507f1f77bcf86cd799439011", ".wav", stream)
            );
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

            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.DeleteAudioAsync(User02, Project01, User01, dataId)
            );
        }

        [Test]
        public void DeleteAudioAsync_InvalidDataId_FormatError()
        {
            var env = new TestEnvironment();

            Assert.ThrowsAsync<FormatException>(
                () => env.Service.DeleteAudioAsync(User02, Project01, User01, "/../test/abc.txt")
            );
        }

        [Test]
        public void DeleteAudioAsync_InvalidProjectId_NotFoundError()
        {
            var env = new TestEnvironment();

            Assert.ThrowsAsync<DataNotFoundException>(
                () => env.Service.DeleteAudioAsync(User02, "/../test/abc.txt", User01, "507f1f77bcf86cd799439011")
            );
        }

        [Test]
        public async Task GetProjectRoleAsync_InvalidProjectId_ReturnsNull()
        {
            var env = new TestEnvironment();
            var role = await env.Service.GetProjectRoleAsync(User02, "invalid_project_id");
            Assert.That(role, Is.Null);
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

            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.UpdateRoleAsync(User02, SystemRole.User, Project01, TestProjectRole.Administrator)
            );
        }

        [Test]
        public void SetSyncDisabled_RequiresSysAdmin()
        {
            var env = new TestEnvironment();
            // SUT 1
            Assert.ThrowsAsync<ForbiddenException>(
                async () => await env.Service.SetSyncDisabledAsync(User03, SystemRole.User, Project01, false)
            );
            // SUT 2
            Assert.ThrowsAsync<ForbiddenException>(
                async () => await env.Service.SetSyncDisabledAsync(User03, SystemRole.None, Project01, false)
            );
            // SUT 3
            Assert.DoesNotThrowAsync(
                async () => await env.Service.SetSyncDisabledAsync(User03, SystemRole.SystemAdmin, Project01, false)
            );
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
            Assert.ThrowsAsync<ArgumentNullException>(
                () => env.Service.RemoveUserFromProjectAsync(null, projectDoc, userDoc)
            );
            Assert.ThrowsAsync<ArgumentNullException>(
                () => env.Service.RemoveUserFromProjectAsync(connection, null, userDoc)
            );
            Assert.ThrowsAsync<ArgumentNullException>(
                () => env.Service.RemoveUserFromProjectAsync(connection, projectDoc, null)
            );
        }

        [Test]
        public void RemoveUserAsync_BadArguments()
        {
            var env = new TestEnvironment();
            Assert.ThrowsAsync<ArgumentNullException>(
                () => env.Service.RemoveUserAsync(null, "projectId", "projectUserId")
            );
            Assert.ThrowsAsync<ArgumentNullException>(
                () => env.Service.RemoveUserAsync("curUserId", null, "projectUserId")
            );
            Assert.ThrowsAsync<ArgumentNullException>(
                () => env.Service.RemoveUserAsync("curUserId", "projectId", null)
            );
        }

        [Test]
        public async Task RemoveUserAsync_DisassociatesUserAndProject()
        {
            var env = new TestEnvironment();
            string requestingUser = User01;
            string project = Project01;
            string userToDisassociate = User02;
            await env.Service.SetUserProjectPermissions(User01, Project01, User02, new string[] { "questions.edit" });
            Assert.AreEqual(1, env.GetProject(project).UserPermissions.Count);
            Assert.That(env.GetProject(project).UserRoles, Does.ContainKey(userToDisassociate), "setup");
            Assert.That(env.GetProject(project).UserPermissions, Does.ContainKey(userToDisassociate), "setup");
            Site userSite = env.GetUser(userToDisassociate).Sites[SiteId];
            Assert.That(userSite.Projects, Does.Contain(project), "setup");
            Assert.That(userSite.CurrentProjectId, Is.EqualTo(Project01));
            // SUT
            await env.Service.RemoveUserAsync(requestingUser, project, userToDisassociate);
            Assert.That(env.GetProject(project).UserRoles, Does.Not.ContainKey(userToDisassociate));
            Assert.That(env.GetProject(project).UserPermissions, Does.Not.ContainKey(userToDisassociate));
            userSite = env.GetUser(userToDisassociate).Sites[SiteId];
            Assert.That(userSite.Projects, Does.Not.Contain(project));
            Assert.That(userSite.CurrentProjectId, Is.Null);
        }

        [Test]
        public void RemoveUserFromAllProjectsAsync_BadArguments()
        {
            var env = new TestEnvironment();
            Assert.ThrowsAsync<ArgumentNullException>(
                () => env.Service.RemoveUserFromAllProjectsAsync(null, "projectUserId")
            );
            Assert.ThrowsAsync<ArgumentNullException>(
                () => env.Service.RemoveUserFromAllProjectsAsync("curUserId", null)
            );
        }

        [Test]
        public async Task RemoveUserFromAllProjectsAsync_DisassociatesUserAndProjects()
        {
            var env = new TestEnvironment();
            string requestingUser = User02;
            string userToDisassociate = User01;

            Assert.That(
                env.GetProject(Project01).UserRoles[requestingUser] != TestProjectRole.Administrator,
                "setup: user requesting deletion should not be a project administrator to demonstrate the "
                    + "functionality"
            );
            Assert.That(
                env.GetProject(Project02).UserRoles[requestingUser] != TestProjectRole.Administrator,
                "setup: user requesting deletion should not be a project administrator to demonstrate the "
                    + "functionality"
            );
            Assert.That(requestingUser, Is.Not.EqualTo(userToDisassociate), "setup: not demonstrating functionality");

            Assert.That(env.GetProject(Project01).UserRoles, Does.ContainKey(userToDisassociate), "setup");
            Assert.That(env.GetUser(userToDisassociate).Sites[SiteId].Projects, Does.Contain(Project01), "setup");
            Assert.That(env.GetProject(Project02).UserRoles, Does.ContainKey(userToDisassociate), "setup");
            Assert.That(env.GetUser(userToDisassociate).Sites[SiteId].Projects, Does.Contain(Project02), "setup");
            // SUT
            await env.Service.RemoveUserFromAllProjectsAsync(requestingUser, userToDisassociate);
            Assert.That(env.GetProject(Project01).UserRoles, Does.Not.ContainKey(userToDisassociate));
            Assert.That(env.GetUser(userToDisassociate).Sites[SiteId].Projects, Does.Not.Contain(Project01));
            Assert.That(env.GetProject(Project02).UserRoles, Does.Not.ContainKey(userToDisassociate));
            Assert.That(env.GetUser(userToDisassociate).Sites[SiteId].Projects, Does.Not.Contain(Project02));
        }

        [Test]
        public async Task SetUserProjectPermissions_AdminHasPermission()
        {
            var env = new TestEnvironment();
            var permissions = new string[] { "questions.create", "questions.edit" };

            Project project = env.GetProject(Project01);
            Assert.AreEqual(0, project.UserPermissions.Count, "setup");

            // Admin can give user question permission
            await env.Service.SetUserProjectPermissions(User01, Project01, User02, permissions);
            project = env.GetProject(Project01);
            Assert.AreEqual(1, project.UserPermissions.Count);
            project.UserPermissions.TryGetValue(User02, out string[] value);
            Assert.AreEqual(permissions, value);

            // Admin can revoke permission, which removes the key value pair from the userPermissions property
            await env.Service.SetUserProjectPermissions(User01, Project01, User02, new string[] { });
            project = env.GetProject(Project01);
            Assert.AreEqual(0, project.UserPermissions.Count);
        }

        [Test]
        public void SetUserProjectPermissions_NonAdminDoesNotHavePermission()
        {
            var env = new TestEnvironment();
            var permissions = new string[] { "questions.create", "questions.edit" };

            Project project = env.GetProject(Project01);
            Assert.AreEqual(0, project.UserPermissions.Count, "setup");

            // Translator user cannot give permission to self
            Assert.ThrowsAsync<ForbiddenException>(
                () => env.Service.SetUserProjectPermissions(User02, Project01, User02, permissions)
            );

            // Permissions are not updated
            project = env.GetProject(Project01);
            Assert.AreEqual(0, project.UserPermissions.Count);
        }

        private class TestEnvironment
        {
            public TestEnvironment(bool isResetLinkExpired = false)
            {
                RealtimeService = new MemoryRealtimeService();
                RealtimeService.AddRepository(
                    "users",
                    OTType.Json0,
                    new MemoryRepository<User>(
                        new[]
                        {
                            new User
                            {
                                Id = User01,
                                Email = "user01@example.com",
                                Sites = new Dictionary<string, Site>
                                {
                                    {
                                        SiteId,
                                        new Site()
                                        {
                                            CurrentProjectId = Project01,
                                            Projects = new List<String>() { Project01, Project02 }
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
                                    {
                                        SiteId,
                                        new Site()
                                        {
                                            CurrentProjectId = Project01,
                                            Projects = new List<String>() { Project01, Project02 }
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
                        }
                    )
                );
                RealtimeService.AddRepository(
                    "projects",
                    OTType.Json0,
                    new MemoryRepository<TestProject>(
                        new[]
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
                        }
                    )
                );

                var siteOptions = Substitute.For<IOptions<SiteOptions>>();
                siteOptions.Value.Returns(
                    new SiteOptions
                    {
                        Id = SiteId,
                        Name = "xForge",
                        Origin = new Uri("http://localhost"),
                        SiteDir = "site"
                    }
                );
                AudioService = Substitute.For<IAudioService>();

                ProjectSecrets = new MemoryRepository<TestProjectSecret>(
                    new[] { new TestProjectSecret { Id = Project01 } }
                );

                FileSystemService = Substitute.For<IFileSystemService>();

                Service = new TestProjectService(
                    RealtimeService,
                    siteOptions,
                    AudioService,
                    ProjectSecrets,
                    FileSystemService
                );
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
