using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using SIL.XForge;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Scripture.Services;
using SIL.XForge.Services;

namespace PTDDCloneAll
{
    /// <summary>
    /// A service class that handles cloning Paratext project repos to Scripture Forge using Paratext Data dlls.
    /// </summary>
    public class CloneAllService : ICloneAllService
    {
        public const string CLONE = "clone";
        public const string CLONE_AND_MOVE_OLD = "cloneandmoveold";
        public const string CLONE_SILENT = "clonesilent";

        // Discard un-synchronize SF data. S/R the project directory with PT servers. Import project directory data into SF.
        public const string SYNCHRONIZE_SF = "synchronizesf";

        // Write SF data to project directory. S/R the project directory with PT servers. Import project directory data into SF.
        public const string SYNCHRONIZE_PT_SF = "synchronizeptsf";
        public const string INSPECT = "inspect";

        private readonly Func<IPTDDSyncRunner> _syncRunnerFactory;
        private readonly IRealtimeService _realtimeService;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IParatextService _paratextService;
        private readonly IRepository<UserSecret> _userSecretRepo;
        private readonly IFileSystemService _fileSystemService;

        public static string GetMode(string mode)
        {
            bool cloneProject = mode == CLONE || mode == CLONE_AND_MOVE_OLD || mode == CLONE_SILENT;
            bool synchronizeProject = mode == SYNCHRONIZE_SF || mode == SYNCHRONIZE_PT_SF;
            return cloneProject || synchronizeProject ? mode : INSPECT;
        }

        public CloneAllService(
            Func<IPTDDSyncRunner> syncRunnerFactory,
            IRealtimeService realtimeService,
            IOptions<SiteOptions> siteOptions,
            IParatextService paratextService,
            IRepository<UserSecret> userSecretRepo,
            IFileSystemService fileSystemService
        )
        {
            _syncRunnerFactory = syncRunnerFactory;
            _realtimeService = realtimeService;
            _siteOptions = siteOptions;
            _paratextService = paratextService;
            _userSecretRepo = userSecretRepo;
            _fileSystemService = fileSystemService;
        }

        /// <summary>
        /// Iterates through SF projects on the server and identifies one administrator user on the project.
        /// Using the administrator user's secrets, perform a send/receive with the Paratext server. Effectively,
        /// this clones the project to the Scripture Forge server.
        /// This will overwrite any un-synchronized data on SF.
        /// </summary>
        public async Task CloneSFProjects(string mode, IEnumerable<SFProject> projectsToClone)
        {
            string syncDir = Path.Join(_siteOptions.Value.SiteDir, "sync");

            string syncDirOld = Path.Join(_siteOptions.Value.SiteDir, "sync_old");
            if (mode == CLONE_AND_MOVE_OLD)
            {
                if (!_fileSystemService.DirectoryExists(syncDirOld))
                    _fileSystemService.CreateDirectory(syncDirOld);
            }

            IConnection connection = await _realtimeService.ConnectAsync();
            // Get the paratext project ID and admin user for all SF Projects
            foreach (SFProject proj in projectsToClone)
            {
                bool foundAdmin = false;
                foreach (string userId in proj.UserRoles.Keys)
                {
                    if (proj.UserRoles.TryGetValue(userId, out string role) && role == SFProjectRole.Administrator)
                    {
                        foundAdmin = true;
                        UserSecret userSecret = _userSecretRepo
                            .Query()
                            .FirstOrDefault((UserSecret us) => us.Id == userId);
                        string ptUsername = _paratextService.GetParatextUsername(userSecret);
                        Log($"Project administrator identified on {proj.Name}: {ptUsername} ({userId})");
                        if (mode == INSPECT)
                            break;
                        try
                        {
                            var projectDoc = await connection.FetchAsync<SFProject>(proj.Id);
                            await projectDoc.SubmitJson0OpAsync(op =>
                            {
                                // Increment the queued count such as in SyncService
                                op.Inc(pd => pd.Sync.QueuedCount);
                            });
                            // Clone the paratext project and update the SF database with the project data
                            await CloneAndSyncFromParatext(proj, userId, syncDir, mode);

                            if (mode == CLONE_AND_MOVE_OLD)
                            {
                                string projectDir = Path.Join(syncDir, proj.Id);
                                string projectDirOld = Path.Join(syncDirOld, proj.Id);
                                _fileSystemService.MoveDirectory(projectDir, projectDirOld);
                            }
                            break;
                        }
                        catch (Exception e)
                        {
                            Log(
                                $"Unable to clone {proj.Name} ({proj.Id}) as user: {userId}{Environment.NewLine}"
                                    + $"Error was: {e}"
                            );
                        }
                    }
                }
                if (!foundAdmin)
                    Log($"ERROR: Unable to identify a project administrator on {proj.Name}");
            }
        }

        /// <summary>
        /// Clone Paratext project data into the SF projects sync folder. Then synchronize existing books
        /// and notes in project.
        /// </summary>
        public async Task CloneAndSyncFromParatext(SFProject proj, string userId, string syncDir, string mode)
        {
            bool silent = mode == CLONE_SILENT;
            bool pushLocal = mode == SYNCHRONIZE_PT_SF;
            bool syncMode = mode == SYNCHRONIZE_SF || mode == SYNCHRONIZE_PT_SF;
            Log($"Cloning {proj.Name} ({proj.Id}) as SF user {userId}");
            string existingCloneDir = Path.Join(syncDir, proj.ParatextId);
            // If the project directory already exists, no need to sync the project
            if (_fileSystemService.DirectoryExists(existingCloneDir) && !syncMode)
            {
                Log("The project has already been cloned. Skipping...");
                return;
            }
            try
            {
                await CloneProject(proj.Id, userId, silent, pushLocal);
                Log($"{proj.Name} - Succeeded");
                if (silent)
                {
                    Log($"Deleting cloned repository for {proj.Name}");
                    _fileSystemService.DeleteDirectory(existingCloneDir);
                }
            }
            catch (Exception e)
            {
                Log($"There was a problem cloning the project.{Environment.NewLine}Exception is: {e}");
                if (_fileSystemService.DirectoryExists(existingCloneDir) && !syncMode)
                    _fileSystemService.DeleteDirectory(existingCloneDir);
                throw;
            }
        }

        public Task CloneProject(string sfProjectId, string sfUserId, bool isSilent, bool pushLocal)
        {
            IPTDDSyncRunner syncRunner = _syncRunnerFactory();
            return syncRunner.RunAsync(sfProjectId, sfUserId, false, isSilent, pushLocal);
        }

        public void Log(string message)
        {
            string when = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
            Console.WriteLine($"{when} PTDDCloneAll: {message}");
        }
    }
}
