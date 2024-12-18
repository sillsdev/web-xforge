using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using MongoDB.Bson;
using PtxUtils;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

public class SystemAdministrationService : ISystemAdministrationService
{
    private readonly IRepository<HelpVideo> _helpVideos;

    public SystemAdministrationService(IRepository<HelpVideo> helpVideos) => _helpVideos = helpVideos;

    public IEnumerable<HelpVideo> GetHelpVideos(string[] systemRoles)
    {
        if (!systemRoles.Contains(SystemRole.SystemAdmin))
            throw new ForbiddenException();

        return _helpVideos.Query().AsEnumerable();
    }

    public async Task<IEnumerable<HelpVideo>> SaveHelpVideoAsync(string[] systemRoles, HelpVideo helpVideo)
    {
        if (!systemRoles.Contains(SystemRole.SystemAdmin))
            throw new ForbiddenException();

        helpVideo.Id = new ObjectId().ToString();
        await _helpVideos.InsertAsync(helpVideo);
        return GetHelpVideos(systemRoles);
    }
}
