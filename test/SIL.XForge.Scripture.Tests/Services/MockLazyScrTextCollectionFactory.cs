using System.IO;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    class MockLazyScrTextCollectionFactory : LazyScrTextCollectionFactory
    {
        public MockLazyScrTextCollectionFactory(IFileSystemService fileSystemService)
        {
            FileSystemService = fileSystemService;
        }

        internal IFileSystemService FileSystemService { get; set; }

        public override LazyScrTextCollection Create(string username)
        {
            var lazyScrTextCollection = new MockLazyScrTextCollection(Path.Combine(_projectsDir, username),
                username);
            lazyScrTextCollection.FileSystemService = FileSystemService;
            return lazyScrTextCollection;
        }
    }
}
