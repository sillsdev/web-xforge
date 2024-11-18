using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Utils;

namespace SIL.XForge.Services;

/// <summary>
/// This class contains the common functionality for managing xForge projects.
/// </summary>
public abstract class ProjectService<TModel, TSecret> : IProjectService
    where TModel : Project, new()
    where TSecret : ProjectSecret
{
    private readonly IAudioService _audioService;

    public ProjectService(
        IRealtimeService realtimeService,
        IOptions<SiteOptions> siteOptions,
        IAudioService audioService,
        IRepository<TSecret> projectSecrets,
        IFileSystemService fileSystemService
    )
    {
        RealtimeService = realtimeService;
        SiteOptions = siteOptions;
        _audioService = audioService;
        ProjectSecrets = projectSecrets;
        FileSystemService = fileSystemService;
    }

    protected IRealtimeService RealtimeService { get; }
    protected IOptions<SiteOptions> SiteOptions { get; }
    protected IRepository<TSecret> ProjectSecrets { get; }
    protected IFileSystemService FileSystemService { get; }
    protected abstract string ProjectAdminRole { get; }

    public async Task AddUserAsync(string curUserId, string projectId, string? projectRole)
    {
        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);

        IDocument<User> userDoc = await GetUserDocAsync(curUserId, conn);

        if (!userDoc.Data.Roles.Contains(SystemRole.SystemAdmin) || projectRole is null)
        {
            Attempt<string> attempt = await TryGetProjectRoleAsync(projectDoc.Data, curUserId);
            if (!attempt.TryResult(out projectRole))
                throw new ForbiddenException();
        }

        await AddUserToProjectAsync(conn, projectDoc, userDoc, projectRole!);
    }

    /// <summary>
    /// Disassociate user projectUserId from project projectId, if curUserId is allowed to cause that.
    /// </summary>
    public async Task RemoveUserAsync(string curUserId, string projectId, string projectUserId)
    {
        if (curUserId == null || projectId == null || projectUserId == null)
        {
            throw new ArgumentNullException();
        }
        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);

        if (curUserId != projectUserId && !IsProjectAdmin(projectDoc.Data, curUserId))
            throw new ForbiddenException();
        await RemoveUserCoreAsync(conn, curUserId, projectId, projectUserId);
    }

    /// <summary>
    /// Disassociate user projectUserId from project projectId. No permissions check is performed.
    /// </summary>
    public async Task RemoveUserWithoutPermissionsCheckAsync(string curUserId, string projectId, string projectUserId)
    {
        if (curUserId == null || projectId == null || projectUserId == null)
        {
            throw new ArgumentNullException();
        }
        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        await RemoveUserCoreAsync(conn, curUserId, projectId, projectUserId);
    }

    /// <summary>
    /// Disassociate user projectUserId from project projectId, without checking permissions.
    /// </summary>
    private async Task RemoveUserCoreAsync(IConnection conn, string curUserId, string projectId, string projectUserId)
    {
        if (curUserId == null || projectId == null || projectUserId == null)
        {
            throw new ArgumentNullException();
        }
        IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);
        IDocument<User> userDoc = await conn.FetchAsync<User>(projectUserId);
        await RemoveUserFromProjectAsync(conn, projectDoc, userDoc);
    }

    /// <summary>
    /// Disassociate user projectUserId from all projects on the site that this ProjectService is operating on.
    /// As requested by curUserId. Permissions to do so are not checked.
    /// </summary>
    public async Task RemoveUserFromAllProjectsAsync(string curUserId, string projectUserId)
    {
        if (curUserId == null || projectUserId == null)
        {
            throw new ArgumentNullException();
        }
        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<User> userDoc = await GetUserDocAsync(projectUserId, conn);
        IEnumerable<Task> removalTasks = userDoc
            .Data.Sites[SiteOptions.Value.Id]
            .Projects.Select((string projectId) => RemoveUserCoreAsync(conn, curUserId, projectId, projectUserId));
        // The removals can be processed in parallel in production, but for unit tests, MemoryRealtimeService
        // does not fully implement concurrent editing of docs, so run them in a sequence.
        foreach (Task task in removalTasks)
        {
            await task;
        }
    }

    public async Task<string> GetProjectRoleAsync(string curUserId, string projectId)
    {
        TModel project;
        try
        {
            project = await GetProjectAsync(projectId);
        }
        catch (DataNotFoundException)
        {
            return null;
        }
        Attempt<string> attempt = await TryGetProjectRoleAsync(project, curUserId);
        return attempt.Result;
    }

    public async Task UpdateRoleAsync(
        string curUserId,
        string[] systemRoles,
        string projectId,
        string idOfUserToUpdate,
        string projectRole
    )
    {
        TModel project = await GetProjectAsync(projectId);
        if (!systemRoles.Contains(SystemRole.SystemAdmin) && !IsProjectAdmin(project, curUserId))
            throw new ForbiddenException();

        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);

        await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.UserRoles[idOfUserToUpdate], projectRole));
    }

    /// <summary>
    /// Saves the audio data to the file system, performing MP3 conversion if necessary
    /// </summary>
    /// <param name="curUserId">The user identifier</param>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="dataId">The data identifier.</param>
    /// <param name="path">The path to the temporary file.</param>
    /// <returns>The relative URL to the file.</returns>
    /// <exception cref="ForbiddenException">The user does not have access to upload.</exception>
    /// <exception cref="FormatException">The data id is not the correct format.</exception>
    public async Task<Uri> SaveAudioAsync(string curUserId, string projectId, string dataId, string path)
    {
        if (!StringUtils.ValidateId(dataId))
            throw new FormatException($"{nameof(dataId)} is not a valid id.");

        TModel project = await GetProjectAsync(projectId);

        if (!project.UserRoles.ContainsKey(curUserId))
            throw new ForbiddenException();

        string audioDir = GetAudioDir(projectId);
        if (!FileSystemService.DirectoryExists(audioDir))
            FileSystemService.CreateDirectory(audioDir);
        string outputPath = Path.Combine(audioDir, $"{curUserId}_{dataId}.mp3");
        if (await _audioService.IsMp3FileAsync(path))
        {
            // Delete the existing file, if it exists
            if (FileSystemService.FileExists(outputPath))
            {
                FileSystemService.DeleteFile(outputPath);
            }

            // Relocate the temporary file to the new directory
            FileSystemService.MoveFile(path, outputPath);
        }
        else
        {
            // Convert the file to mp3
            try
            {
                await _audioService.ConvertToMp3Async(path, outputPath);
            }
            finally
            {
                // Remove the temporary file, if it still exists
                if (FileSystemService.FileExists(path))
                {
                    FileSystemService.DeleteFile(path);
                }
            }
        }
        string outputFileName = Path.GetFileName(outputPath);
        var uri = new Uri(
            $"/assets/audio/{projectId}/{outputFileName}?t={DateTime.UtcNow.ToFileTime()}",
            UriKind.Relative
        );
        return uri;
    }

    public async Task DeleteAudioAsync(string curUserId, string projectId, string ownerId, string dataId)
    {
        if (!StringUtils.ValidateId(dataId))
            throw new FormatException($"{nameof(dataId)} is not a valid id.");

        TModel project = await GetProjectAsync(projectId);

        if (curUserId != ownerId && !IsProjectAdmin(project, curUserId))
            throw new ForbiddenException();

        string audioDir = GetAudioDir(projectId);
        string filePath = Path.Combine(audioDir, $"{ownerId}_{dataId}.mp3");
        if (FileSystemService.FileExists(filePath))
            FileSystemService.DeleteFile(filePath);
    }

    public async Task<TModel> GetProjectAsync(string projectId)
    {
        Attempt<TModel> projectAttempt = await RealtimeService.TryGetSnapshotAsync<TModel>(projectId);
        if (!projectAttempt.TryResult(out TModel project))
        {
            throw new DataNotFoundException("The project does not exist.");
        }
        return project;
    }

    public async Task SetSyncDisabledAsync(string curUserId, string[] systemRoles, string projectId, bool isDisabled)
    {
        if (!systemRoles.Contains(SystemRole.SystemAdmin))
            throw new ForbiddenException();

        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);
        await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.SyncDisabled, isDisabled));
    }

    public async Task SetRoleProjectPermissionsAsync(
        string curUserId,
        string projectId,
        string role,
        string[] permissions
    )
    {
        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);
        if (!IsProjectAdmin(projectDoc.Data, curUserId))
            throw new ForbiddenException();

        if (permissions.Length == 0)
        {
            await projectDoc.SubmitJson0OpAsync(op => op.Unset(p => p.RolePermissions[role]));
        }
        else
        {
            await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.RolePermissions[role], permissions));
        }
    }

    public async Task SetUserProjectPermissionsAsync(
        string curUserId,
        string projectId,
        string userId,
        string[] permissions
    )
    {
        await using IConnection conn = await RealtimeService.ConnectAsync(curUserId);
        IDocument<TModel> projectDoc = await GetProjectDocAsync(projectId, conn);
        if (!IsProjectAdmin(projectDoc.Data, curUserId))
            throw new ForbiddenException();

        if (permissions.Length == 0)
        {
            await projectDoc.SubmitJson0OpAsync(op => op.Unset(p => p.UserPermissions[userId]));
        }
        else
        {
            await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.UserPermissions[userId], permissions));
        }
    }

    protected virtual async Task AddUserToProjectAsync(
        IConnection conn,
        IDocument<TModel> projectDoc,
        IDocument<User> userDoc,
        string projectRole,
        string? shareKey = null
    )
    {
        await projectDoc.SubmitJson0OpAsync(op => op.Set(p => p.UserRoles[userDoc.Id], projectRole));
        ProjectSecret projectSecret = await ProjectSecrets.GetAsync(projectDoc.Id);
        if (!string.IsNullOrWhiteSpace(shareKey) && projectSecret != null)
        {
            int index = projectSecret.ShareKeys.FindIndex(sk =>
                sk.RecipientUserId == null && sk.ShareLinkType == ShareLinkType.Recipient && sk.Key == shareKey
            );
            if (index > -1)
            {
                await ProjectSecrets.UpdateAsync(
                    p => p.Id == projectDoc.Id,
                    update =>
                        update
                            .Set(p => p.ShareKeys[index].RecipientUserId, userDoc.Id)
                            .Unset(p => p.ShareKeys[index].Email)
                            .Unset(p => p.ShareKeys[index].ExpirationTime)
                            .Unset(p => p.ShareKeys[index].Reserved)
                );
            }
        }
        string siteId = SiteOptions.Value.Id;
        await userDoc.SubmitJson0OpAsync(op => op.Add(u => u.Sites[siteId].Projects, projectDoc.Id));
    }

    protected internal virtual async Task RemoveUserFromProjectAsync(
        IConnection conn,
        IDocument<TModel> projectDoc,
        IDocument<User> userDoc
    )
    {
        if (conn == null || projectDoc == null || userDoc == null)
        {
            throw new ArgumentNullException();
        }
        if (projectDoc.IsLoaded)
        {
            await projectDoc.SubmitJson0OpAsync(op => op.Unset(p => p.UserRoles[userDoc.Id]));
            await projectDoc.SubmitJson0OpAsync(op => op.Unset(p => p.UserPermissions[userDoc.Id]));
        }
        if (userDoc.IsLoaded)
        {
            string siteId = SiteOptions.Value.Id;
            await userDoc.SubmitJson0OpAsync(op =>
            {
                int index = userDoc.Data.Sites[siteId].Projects.IndexOf(projectDoc.Id);
                op.Remove(u => u.Sites[siteId].Projects, index);
                if (userDoc.Data.Sites[siteId].CurrentProjectId == projectDoc.Id)
                    op.Unset(u => u.Sites[siteId].CurrentProjectId);
            });
        }
    }

    protected bool IsOnProject(TModel project, string userId) => project.UserRoles.ContainsKey(userId);

    protected bool IsProjectAdmin(TModel project, string userId) =>
        project.UserRoles.TryGetValue(userId, out string role) && role == ProjectAdminRole;

    protected string GetAudioDir(string projectId) => Path.Combine(SiteOptions.Value.SiteDir, "audio", projectId);

    protected abstract Task<Attempt<string>> TryGetProjectRoleAsync(TModel project, string userId);

    /// <summary>
    /// Gets the project document.
    /// </summary>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="conn">The connection.</param>
    /// <returns>The loaded project document.</returns>
    /// <exception cref="DataNotFoundException">The project does not exist.</exception>
    protected async Task<IDocument<TModel>> GetProjectDocAsync(string projectId, IConnection conn)
    {
        IDocument<TModel> projectDoc = await conn.FetchAsync<TModel>(projectId);
        if (!projectDoc.IsLoaded)
            throw new DataNotFoundException("The project does not exist.");
        return projectDoc;
    }

    protected async Task<IDocument<User>> GetUserDocAsync(string userId, IConnection conn)
    {
        IDocument<User> userDoc = await conn.FetchAsync<User>(userId);
        if (!userDoc.IsLoaded)
            throw new DataNotFoundException("The user does not exist.");
        return userDoc;
    }
}
