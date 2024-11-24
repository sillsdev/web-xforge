using System.Collections.Generic;
using NSubstitute;
using NUnit.Framework;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

public class SFProjectRightsTests
{
    private const string User01 = "user01";
    private const string User02 = "user02";
    private const string TranslatorCreateJson = $$"""
        {
          "{{SFProjectRole.Translator}}": {
            "{{SFProjectDomain.TrainingData}}": ["{{Operation.Create}}"],
          }
        }
        """;
    private const string TranslatorEditOwnJson = $$"""
        {
          "{{SFProjectRole.Translator}}": {
            "{{SFProjectDomain.TrainingData}}": ["{{Operation.EditOwn}}"],
          }
        }
        """;

    [Test]
    public void HasPermissions_EmptyPermissions()
    {
        var env = new TestEnvironment();
        var project = TestEnvironment.GetProject(userPermissions: true, userRoles: true, rolePermissions: false);
        string[] permissions = [];

        // SUT
        bool actual = env.Service.HasPermissions(project, User01, permissions);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasPermissions_OnePermissionIsValidTheOtherInvalid()
    {
        var env = new TestEnvironment(TranslatorCreateJson);
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: true, rolePermissions: false);
        string[] permissions =
        [
            SFProjectRights.JoinRight(SFProjectDomain.TrainingData, Operation.Create),
            SFProjectRights.JoinRight(SFProjectDomain.Drafts, Operation.Create),
        ];

        // SUT
        bool actual = env.Service.HasPermissions(project, User01, permissions);
        Assert.IsFalse(actual);
    }

    [Test]
    public void HasPermissions_TooFewPermissionParts()
    {
        var env = new TestEnvironment(TranslatorCreateJson);
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: true, rolePermissions: false);
        string[] permissions = [SFProjectDomain.Texts];

        // SUT
        bool actual = env.Service.HasPermissions(project, User01, permissions);
        Assert.IsFalse(actual);
    }

    [Test]
    public void HasPermissions_TooManyPermissionParts()
    {
        var env = new TestEnvironment(TranslatorCreateJson);
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: true, rolePermissions: false);
        string[] permissions =
        [
            $"{SFProjectRights.JoinRight(SFProjectDomain.TrainingData, Operation.Create)}.additional_data",
        ];

        // SUT
        bool actual = env.Service.HasPermissions(project, User01, permissions);
        Assert.IsFalse(actual);
    }

    [Test]
    public void HasPermissions_ValidPermissions()
    {
        var env = new TestEnvironment();
        var project = TestEnvironment.GetProject(userPermissions: true, userRoles: true, rolePermissions: false);
        string[] permissions = [SFProjectRights.JoinRight(SFProjectDomain.TrainingData, Operation.Create)];

        // SUT
        bool actual = env.Service.HasPermissions(project, User01, permissions);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasRight_CanCreateExistingDataByTheSameUser()
    {
        var env = new TestEnvironment(TranslatorCreateJson);
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: true, rolePermissions: false);
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
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: true, rolePermissions: false);
        var data = new TrainingData { OwnerRef = User01 };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Delete, data);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasRight_CanEditOwn()
    {
        var env = new TestEnvironment(TranslatorEditOwnJson);
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: true, rolePermissions: false);
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
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: true, rolePermissions: false);
        var data = new TrainingData { OwnerRef = User01 };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.View, data);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasRight_CannotCreateExistingDataCreatedByAnotherUser()
    {
        var env = new TestEnvironment(TranslatorCreateJson);
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: true, rolePermissions: false);
        var data = new TrainingData { OwnerRef = User02 };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Create, data);
        Assert.IsFalse(actual);
    }

    [Test]
    public void HasRight_CannotEditDataCreatedByAnotherUserWithEditOwnPermission()
    {
        var env = new TestEnvironment(TranslatorEditOwnJson);
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: true, rolePermissions: false);
        var data = new TrainingData { OwnerRef = User02 };

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Edit, data);
        Assert.IsFalse(actual);
    }

    [Test]
    public void HasRight_CannotEditNullDataWithEditOwnPermission()
    {
        var env = new TestEnvironment(TranslatorEditOwnJson);
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: true, rolePermissions: false);

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Edit, data: null);
        Assert.IsFalse(actual);
    }

    [Test]
    public void HasRight_NoUserId()
    {
        var env = new TestEnvironment();
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: false, rolePermissions: false);

        // SUT
        bool actual = env.Service.HasRight(project, userId: null, SFProjectDomain.TrainingData, Operation.Create);
        Assert.IsFalse(actual);
    }

    [Test]
    public void HasRight_ProjectRolePermission()
    {
        var env = new TestEnvironment();
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: true, rolePermissions: true);

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Create);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasRight_SystemRolePermission()
    {
        var env = new TestEnvironment(TranslatorCreateJson);
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: true, rolePermissions: false);

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Create);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasRight_ProjectUserPermission()
    {
        var env = new TestEnvironment();
        var project = TestEnvironment.GetProject(userPermissions: true, userRoles: true, rolePermissions: false);

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Create);
        Assert.IsTrue(actual);
    }

    [Test]
    public void HasRight_UserHasNoPermission()
    {
        var env = new TestEnvironment(TranslatorEditOwnJson);
        var project = TestEnvironment.GetProject(userRoles: true, userPermissions: false, rolePermissions: false);

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Create);
        Assert.IsFalse(actual);
    }

    [Test]
    public void HasRight_UserHasNoRole()
    {
        var env = new TestEnvironment();
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: false, rolePermissions: false);

        // SUT
        bool actual = env.Service.HasRight(project, User01, SFProjectDomain.TrainingData, Operation.Create);
        Assert.IsFalse(actual);
    }

    [Test]
    public void RoleHasRight_NoRole()
    {
        var env = new TestEnvironment(TranslatorCreateJson);
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: false, rolePermissions: false);

        // SUT
        bool actual = env.Service.RoleHasRight(
            project,
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
        var project = TestEnvironment.GetProject(userRoles: false, userPermissions: false, rolePermissions: true);

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
        var project = TestEnvironment.GetProject(userPermissions: false, userRoles: false, rolePermissions: false);

        // SUT
        bool actual = env.Service.RoleHasRight(
            project,
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

        public static SFProject GetProject(bool userRoles, bool userPermissions, bool rolePermissions) =>
            new SFProject
            {
                RolePermissions = rolePermissions
                    ? new Dictionary<string, string[]>
                    {
                        {
                            SFProjectRole.Translator,
                            [SFProjectRights.JoinRight(SFProjectDomain.TrainingData, Operation.Create)]
                        },
                    }
                    : [],
                UserPermissions = userPermissions
                    ? new Dictionary<string, string[]>
                    {
                        { User01, [SFProjectRights.JoinRight(SFProjectDomain.TrainingData, Operation.Create)] },
                    }
                    : [],
                UserRoles = userRoles ? new Dictionary<string, string> { { User01, SFProjectRole.Translator } } : [],
            };
    }
}
