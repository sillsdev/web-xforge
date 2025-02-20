using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

public interface ITrainingDataService
{
    Task DeleteTrainingDataAsync(IUserAccessor userAccessor, string projectId, string ownerId, string dataId);
    Task GetTextsAsync(
        IUserAccessor userAccessor,
        string projectId,
        IEnumerable<string> dataIds,
        IList<ISFText> sourceTexts,
        IList<ISFText> targetTexts
    );
    Task<Uri> SaveTrainingDataAsync(IUserAccessor userAccessor, string projectId, string dataId, string path);
}
