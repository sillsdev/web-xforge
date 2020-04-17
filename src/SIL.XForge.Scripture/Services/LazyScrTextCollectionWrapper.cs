using Paratext.Data;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// Wraps access to LazyScrTextCollection. This class can be stubbed in tests.
    /// </summary>
    public class LazyScrTextCollectionWrapper : IScrTextCollectionWrapper
    {
        private LazyScrTextCollectionFactory _lazyScrTextCollectionFactory;

        public LazyScrTextCollectionWrapper()
        {
            _lazyScrTextCollectionFactory = new LazyScrTextCollectionFactory();
        }
        /// <summary>
        /// Sets the directory for Paratext projects used to synchronize with the Paratext send/receive server.
        /// </summary>
        public void Initialize(string syncDir = null)
        {
            _lazyScrTextCollectionFactory.Initialize(syncDir);
        }

        /// <summary>
        /// Use the Paratext projectId to create a ScrText from the project data for the given user.
        /// </summary>
        public ScrText FindById(string username, string projectId)
        {
            return _lazyScrTextCollectionFactory.Create(username).FindById(projectId);
        }
    }
}
