using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using NPOI.SS.UserModel;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services;

public interface ITrainingDataService
{
    Task ConvertExcelToCsvAsync(IWorkbook workbook, Stream outputStream);
    Task DeleteTrainingDataAsync(string userId, string projectId, string ownerId, string dataId);
    Task GetTextsAsync(
        string userId,
        string projectId,
        IEnumerable<string> dataIds,
        IList<ISFText> sourceTexts,
        IList<ISFText> targetTexts
    );
    Task<Uri> SaveTrainingDataAsync(string userId, string projectId, string dataId, string path);
}
