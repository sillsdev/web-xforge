using NUnit.Framework;

namespace SIL.XForge.Scripture.Models;

[TestFixture]
public class ParatextSyncResultsTests
{
    [Test]
    public void ParatextSyncResults_BookChanged()
    {
        // SUT
        var syncResults = new ParatextSyncResults();
        syncResults.Books.Add(1);

        Assert.IsTrue(syncResults.UpdateBook(1));
        Assert.IsFalse(syncResults.UpdateBook(2));
        Assert.IsFalse(syncResults.UpdateNotes);
        Assert.IsTrue(syncResults.UpdatePermissions);
        Assert.IsFalse(syncResults.UpdateRoles);
    }

    [Test]
    public void ParatextSyncResults_IsResource()
    {
        // SUT
        var syncResults = new ParatextSyncResults { IsResource = true };

        Assert.IsTrue(syncResults.UpdateBook(1));
        Assert.IsTrue(syncResults.UpdateBook(2));
        Assert.IsFalse(syncResults.UpdateNotes);
        Assert.IsTrue(syncResults.UpdatePermissions);
        Assert.IsFalse(syncResults.UpdateRoles);
    }

    [Test]
    public void ParatextSyncResults_NoChanges()
    {
        // SUT
        var syncResults = new ParatextSyncResults();

        Assert.IsFalse(syncResults.UpdateBook(1));
        Assert.IsFalse(syncResults.UpdateBook(2));
        Assert.IsFalse(syncResults.UpdateNotes);
        Assert.IsFalse(syncResults.UpdatePermissions);
        Assert.IsFalse(syncResults.UpdateRoles);
    }

    [Test]
    public void ParatextSyncResults_NotesChanged()
    {
        // SUT
        var syncResults = new ParatextSyncResults { NotesChanged = true };

        Assert.IsFalse(syncResults.UpdateBook(1));
        Assert.IsFalse(syncResults.UpdateBook(2));
        Assert.IsTrue(syncResults.UpdateNotes);
        Assert.IsFalse(syncResults.UpdatePermissions);
        Assert.IsFalse(syncResults.UpdateRoles);
    }

    [Test]
    public void ParatextSyncResults_PermissionsChanged()
    {
        // SUT
        var syncResults = new ParatextSyncResults { PermissionsChanged = true };

        Assert.IsFalse(syncResults.UpdateBook(1));
        Assert.IsFalse(syncResults.UpdateBook(2));
        Assert.IsFalse(syncResults.UpdateNotes);
        Assert.IsTrue(syncResults.UpdatePermissions);
        Assert.IsTrue(syncResults.UpdateRoles);
    }

    [Test]
    public void ParatextSyncResults_ProjectChanged()
    {
        // SUT
        var syncResults = new ParatextSyncResults { ProjectChanged = true };

        Assert.IsTrue(syncResults.UpdateBook(1));
        Assert.IsTrue(syncResults.UpdateBook(2));
        Assert.IsTrue(syncResults.UpdateNotes);
        Assert.IsTrue(syncResults.UpdatePermissions);
        Assert.IsTrue(syncResults.UpdateRoles);
    }
}
