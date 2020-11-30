using System.Collections.Generic;
using SIL.XForge.Models;

namespace SIL.XForge.Configuration
{
    /// <summary>
    /// This class represents the configuration of the real-time service.
    /// </summary>
    public class RealtimeOptions
    {
        public string AppModuleName { get; set; }
        public int Port { get; set; } = 5003;
        public DocConfig UserDoc { get; set; } = new DocConfig("users", typeof(User));
        public DocConfig ProjectDoc { get; set; }

        /// <summary>
        /// Additional document types (importantly, collection names) that have project related data. Defining this
        /// helps identify and delete project data when removing a project.
        /// </summary>
        public List<DocConfig> ProjectDataDocs { get; set; } = new List<DocConfig>();

        /// <summary>
        /// Document types (importantly, collection names) that have user information, from which to delete records
        /// when removing a user from the database.
        /// </summary>
        public List<DocConfig> UserDataDocs { get; set; } = new List<DocConfig>();

        /// <summary>
        /// Identifying user-related documents to remove relies on knowing how the document _id or d fields are
        /// structured. This dictionary describes where in a document _id or d field to look for the user id, to know
        /// that the document is for a particular user. For example, for a user with id "abc", a document _id of "abc"
        /// would match Location.Whole, a document _id of "123:abc" would match Location.End, and a document _id of
        /// "abc:123" would match Location.Beginning.
        /// </summary>
        public Dictionary<string, Location> UserDataDocsIdLocation { get; set; } = new Dictionary<string, Location>();
    }

    /// <summary>
    /// Where in a series.
    /// </summary>
    public enum Location
    {
        Whole,
        Beginning,
        End
    }
}
