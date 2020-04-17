namespace SIL.XForge.Scripture.Services
{
    /// <summary> Provides access to a lazy implementation of ScrTextCollection. </summary>
    public class LazyScrTextCollectionFactory
    {
        protected string _projectsDir;

        /// <summary> Set the directory to the folder containing Paratext projects. </summary>
        public void Initialize(string path)
        {
            _projectsDir = path;
        }

        public virtual LazyScrTextCollection Create(string username)
        {
            return new LazyScrTextCollection(_projectsDir, username);
        }
    }
}
