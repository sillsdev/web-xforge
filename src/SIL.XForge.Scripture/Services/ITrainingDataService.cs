using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface ITrainingDataService
{
    Task ConvertExcelToCsvAsync(Stream excelStream, Stream outputStream);
    Task GetTextsAsync(
        string userId,
        string projectId,
        IEnumerable<string> dataIds,
        IList<ISFText> sourceTexts,
        IList<ISFText> targetTexts
    );
    Task MarkFileDeleted(string userId, string projectId, string fileId);
    Task<Uri> SaveTrainingDataAsync(string userId, string projectId, string dataId, string path);
}
