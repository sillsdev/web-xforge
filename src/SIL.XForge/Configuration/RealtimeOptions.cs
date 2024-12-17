using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Configuration;

/// <summary>
/// This class represents the configuration of the real-time service.
/// </summary>
public class RealtimeOptions
{
    public string AppModuleName { get; set; }
    public int Port { get; set; }
    public int SecurePort { get; set; }
    public bool MigrationsDisabled { get; set; }
    public bool DataValidationDisabled { get; set; }
    public bool DocumentCacheDisabled { get; set; }
    public bool UseExistingRealtimeServer { get; set; }
    public DocConfig UserDoc { get; set; } = new DocConfig("users", typeof(User));
    public DocConfig ProjectDoc { get; set; }

    /// <summary>
    /// Additional document types (importantly, collection names) that have project related data. Defining this
    /// helps identify and delete project data when removing a project.
    /// </summary>
    public List<DocConfig> ProjectDataDocs { get; set; } = [];

    /// <summary>
    /// Document types (importantly, collection names) that have user information, from which to delete records
    /// when removing a user from the database.
    /// </summary>
    public List<DocConfig> UserDataDocs { get; set; } = [];
}
