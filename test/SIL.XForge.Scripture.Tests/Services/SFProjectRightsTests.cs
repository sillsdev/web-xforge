using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

public class SFProjectRightsTests
{
    const string User01 = "user01";
    const string User02 = "user02";
    const string TranslatorCreateJson = $$"""
        {
          "{{SFProjectRole.Translator}}": {
            "{{SFProjectDomain.TrainingData}}": ["{{Operation.Create}}"],
          }
        }
        """;
    const string TranslatorEditOwnJson = $$"""
        {
          "{{SFProjectRole.Translator}}": {
            "{{SFProjectDomain.TrainingData}}": ["{{Operation.EditOwn}}"],
          }
        }
        """;

    [Test]
    public void HasRight_CanCreateExistingDataByTheSameUser()
    {
        var env = new TestEnvironment(TranslatorCreateJson);
        var project = new SFProject { UserRoles = { { User01, SFProjectRole.Translator } } };
        var data = new TrainingData { OwnerRef = User01 };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Create, data);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasRight_CanDeleteOwn()
    {
        const string json = $$"""
            {
              "{{SFProjectRole.Translator}}": {
                "{{SFProjectDomain.TrainingData}}": ["{{Operation.DeleteOwn}}"],
              }
            }
            """;
        var env = new TestEnvironment(json);
        var project = new SFProject { UserRoles = { { User01, SFProjectRole.Translator } } };
        var data = new TrainingData { OwnerRef = User01 };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Delete, data);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasRight_CanEditOwn()
    {
        var env = new TestEnvironment(TranslatorEditOwnJson);
        var project = new SFProject { UserRoles = { { User01, SFProjectRole.Translator } } };
        var data = new TrainingData { OwnerRef = User01 };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Edit, data);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasRight_CanViewOwn()
    {
        const string json = $$"""
            {
              "{{SFProjectRole.Translator}}": {
                "{{SFProjectDomain.TrainingData}}": ["{{Operation.ViewOwn}}"],
              }
            }
            """;
        var env = new TestEnvironment(json);
        var project = new SFProject { UserRoles = { { User01, SFProjectRole.Translator } } };
        var data = new TrainingData { OwnerRef = User01 };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.View, data);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasRight_CannotCreateExistingDataCreatedByAnotherUser()
    {
        var env = new TestEnvironment(TranslatorCreateJson);
        var project = new SFProject { UserRoles = { { User01, SFProjectRole.Translator } } };
        var data = new TrainingData { OwnerRef = User02 };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Create, data);
        Assert.IsFalse(actual);
    }

    [Test]
    public void HasRight_CannotEditDataCreatedByAnotherUserWithEditOwnPermission()
    {
        var env = new TestEnvironment(TranslatorEditOwnJson);
        var project = new SFProject { UserRoles = { { User01, SFProjectRole.Translator } } };
        var data = new TrainingData { OwnerRef = User02 };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Edit, data);
        Assert.IsFalse(actual);
    }

    [Test]
    public void HasRight_NoUserId()
    {
        var env = new TestEnvironment();

        // SUT
        bool actual = env.Service.HasRight(
            new SFProject(),
            userId: null,
            SFProjectDomain.TrainingData,
            Operation.Create
        );
        Assert.IsFalse(actual);
    }

    [Test]
    public void HasRight_ProjectRolePermission()
    {
        var env = new TestEnvironment();
        var project = new SFProject
        {
            RolePermissions =
            {
                {
                    SFProjectRole.Translator,
                    [SFProjectRights.JoinRight(SFProjectDomain.TrainingData, Operation.Create)]
                },
            },
            UserRoles = { { User01, SFProjectRole.Translator } },
        };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Create);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasRight_SystemRolePermission()
    {
        var env = new TestEnvironment(TranslatorCreateJson);
        var project = new SFProject { UserRoles = { { User01, SFProjectRole.Translator } } };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Create);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasRight_ProjectUserPermission()
    {
        var env = new TestEnvironment();
        var project = new SFProject
        {
            UserPermissions =
            {
                { User01, [SFProjectRights.JoinRight(SFProjectDomain.TrainingData, Operation.Create)] },
            },
            UserRoles = { { User01, SFProjectRole.Translator } },
        };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Create);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasRight_UserHasNoPermission()
    {
        var env = new TestEnvironment(TranslatorEditOwnJson);
        var project = new SFProject { UserRoles = { { User01, SFProjectRole.Translator } } };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Create);
        Assert.IsFalse(actual);
    }

    [Test]
    public void HasRight_UserHasNoRole()
    {
        var env = new TestEnvironment();

        // SUT
        bool actual = env.Service.HasRight(new SFProject(), User01, SFProjectDomain.TrainingData, Operation.Create);
        Assert.IsFalse(actual);
    }

    [Test]
    public void RoleHasRight_NoRole()
    {
        var env = new TestEnvironment(TranslatorCreateJson);

        // SUT
        bool actual = env.Service.RoleHasRight(
            new SFProject(),
            SFProjectRole.Translator,
            SFProjectDomain.TrainingData,
            Operation.Edit
        );
        Assert.IsFalse(actual);
    }

    [Test]
    public void RoleHasRight_ProjectRolePermission()
    {
        var env = new TestEnvironment();
        var project = new SFProject
        {
            RolePermissions =
            {
                {
                    SFProjectRole.Translator,
                    [SFProjectRights.JoinRight(SFProjectDomain.TrainingData, Operation.Create)]
                },
            },
        };

        // SUT
        bool actual = env.Service.RoleHasRight(
            project,
            SFProjectRole.Translator,
            SFProjectDomain.TrainingData,
            Operation.Create
        );
        Assert.IsTrue(actual);
    }

    [Test]
    public void RoleHasRight_SystemRolePermission()
    {
        const string json = $$"""
            {
              "{{SFProjectRole.Translator}}": {
                "{{SFProjectDomain.TrainingData}}": ["{{Operation.Create}}"],
              }
            }
            """;
        var env = new TestEnvironment(json);

        // SUT
        bool actual = env.Service.RoleHasRight(
            new SFProject(),
            SFProjectRole.Translator,
            SFProjectDomain.TrainingData,
            Operation.Create
        );
        Assert.IsTrue(actual);
    }

    private class TestEnvironment
    {
        public TestEnvironment(string json = "{}")
        {
            IFileSystemService fileSystemService = Substitute.For<IFileSystemService>();
            fileSystemService.FileReadText(SFProjectRights.Filename).Returns(json);
            Service = new SFProjectRights(fileSystemService);
        }

        public SFProjectRights Service { get; }
    }
}
