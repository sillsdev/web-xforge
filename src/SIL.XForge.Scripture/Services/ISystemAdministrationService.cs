using System.Collections.Generic;
using System.Threading.Tasks;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services;

public interface ISystemAdministrationService
{
    IEnumerable<HelpVideo> GetHelpVideos(string[] systemRoles);
    Task<IEnumerable<HelpVideo>> SaveHelpVideoAsync(string[] systemRoles, HelpVideo helpVideo);
}
