using System.IO;

namespace SIL.XForge.Scripture.Services
{
    /// <summary> Provides access to a user specific lazy implementation of ScrTextCollection. </summary>
    public class MultiUserLazyScrTextCollection
    {
        private static string _multiUsersDirectory;

        /// <summary> Set the directory to the folder containing individual users project data. </summary>
        public static void Initialize(string path)
        {
            _multiUsersDirectory = path;
        }

        public static LazyScrTextCollection Get(string username)
        {
            return new LazyScrTextCollection(Path.Combine(_multiUsersDirectory, username), username);
        }
    }
}
