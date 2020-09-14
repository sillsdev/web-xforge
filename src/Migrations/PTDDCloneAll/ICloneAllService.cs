using System.Collections.Generic;
using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;

namespace PTDDCloneAll
{
    public interface ICloneAllService
    {
        Task CloneSFProjects(string mode, IEnumerable<SFProject> projectsToClone);
    }
}
