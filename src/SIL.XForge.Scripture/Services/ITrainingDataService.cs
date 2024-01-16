using System;
using System.Threading.Tasks;

namespace SIL.XForge.Scripture.Services;

public interface ITrainingDataService
{
    Task<Uri> SaveTrainingDataAsync(string userId, string projectId, string dataId, string path);
}
