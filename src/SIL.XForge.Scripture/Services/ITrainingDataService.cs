using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface ITrainingDataService
{
    Task GetTextsAsync(
        string userId,
        string projectId,
        IEnumerable<string> dataIds,
        IList<ISFText> sourceTexts,
        IList<ISFText> targetTexts
    );
    Task<Uri> SaveTrainingDataAsync(string userId, string projectId, string dataId, string path);
}
