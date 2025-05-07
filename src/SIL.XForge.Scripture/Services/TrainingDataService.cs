using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using CsvHelper;
using CsvHelper.Configuration;
using Microsoft.Extensions.Options;
using NPOI.HSSF.UserModel;
using NPOI.SS.UserModel;
using NPOI.XSSF.UserModel;
using SIL.XForge.Configuration;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services;

public class TrainingDataService(
    IFileSystemService fileSystemService,
    IRealtimeService realtimeService,
    IOptions<SiteOptions> siteOptions
) : ITrainingDataService
{
    /// <summary>
    /// The training directory name. This is not the full path to the directory.
    /// </summary>
    ///
    public const string DirectoryName = "training-data";
    private static readonly CsvConfiguration _csvConfiguration = new CsvConfiguration(CultureInfo.InvariantCulture)
    {
        DetectColumnCountChanges = true,
        DetectDelimiter = true,
        HasHeaderRecord = false,
    };

    /// <summary>
    /// Converts an Excel file to a two column CSV file.
    /// </summary>
    /// <param name="workbook">The Excel workbook from NPOI.</param>
    /// <param name="outputStream">The stream to write the CSV file to. The stream will be left open.</param>
    /// <returns>An asynchronous task.</returns>
    /// <exception cref="FormatException">The Excel file does not contain two columns of data</exception>
    public async Task ConvertExcelToCsvAsync(IWorkbook workbook, Stream outputStream)
    {
        // Verify there is a worksheet
        if (workbook.NumberOfSheets == 0)
        {
            throw new FormatException("The Excel file does not contain a worksheet");
        }

        // Load the Excel file
        var data = new List<(string, string)>();
        ISheet sheet = workbook.GetSheetAt(0);
        for (int rowNum = sheet.FirstRowNum; rowNum <= sheet.LastRowNum; rowNum++)
        {
            IRow row = sheet.GetRow(rowNum);
            if (row is null || row.FirstCellNum == -1 || row.LastCellNum - row.FirstCellNum < 2)
            {
                // Skip if there are not two columns of data in this row that are side-by-side
                continue;
            }

            string firstColumn =
                row.GetCell(row.FirstCellNum, MissingCellPolicy.CREATE_NULL_AS_BLANK).ToString() ?? string.Empty;
            string secondColumn =
                row.GetCell(row.FirstCellNum + 1, MissingCellPolicy.CREATE_NULL_AS_BLANK).ToString() ?? string.Empty;
            data.Add((firstColumn, secondColumn));
        }

        if (data.Count == 0)
        {
            throw new FormatException("The Excel file does not contain two columns of data");
        }

        // Write the CSV file
        await using StreamWriter streamWriter = new StreamWriter(outputStream, leaveOpen: true);
        await using CsvWriter csvWriter = new CsvWriter(streamWriter, CultureInfo.InvariantCulture, leaveOpen: true);
        foreach ((string first, string second) in data)
        {
            csvWriter.WriteField(first);
            csvWriter.WriteField(second);
            await csvWriter.NextRecordAsync();
        }
    }

    public async Task DeleteTrainingDataAsync(string userId, string projectId, string ownerId, string dataId)
    {
        // Validate input
        if (!StringUtils.ValidateId(dataId))
        {
            throw new FormatException($"{nameof(dataId)} is not a valid id.");
        }

        // Load the project so we can check permissions
        await using IConnection conn = await realtimeService.ConnectAsync(userId);
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        // Ensure permission to access the Machine API
        MachineApi.EnsureProjectPermission(userId, projectDoc.Data);

        // Ensure the user is the owner of the file, or an administrator
        if (
            userId != ownerId
            && !(projectDoc.Data.UserRoles.TryGetValue(userId, out string role) && role is SFProjectRole.Administrator)
        )
        {
            throw new ForbiddenException();
        }

        // Delete the file, if it exists
        string filePath = GetTrainingDataFilePath(userId, projectDoc.Id, dataId);
        if (fileSystemService.FileExists(filePath))
        {
            fileSystemService.DeleteFile(filePath);
        }
    }

    /// <summary>
    /// Gets the source and target texts for the training data files.
    /// </summary>
    /// <param name="userId">The user identifier</param>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="dataIds">The data identifiers to retrieve.</param>
    /// <param name="sourceTexts">The source texts (output).</param>
    /// <param name="targetTexts">The target texts (output).</param>
    /// <returns>The asynchronous task.</returns>
    public async Task GetTextsAsync(
        string userId,
        string projectId,
        IEnumerable<string> dataIds,
        IList<ISFText> sourceTexts,
        IList<ISFText> targetTexts
    )
    {
        await using IConnection conn = await realtimeService.ConnectAsync(userId);
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        MachineApi.EnsureProjectPermission(userId, projectDoc.Data);

        // Ensure that the training data directory exists
        string trainingDataDir = Path.Join(siteOptions.Value.SiteDir, DirectoryName, projectId);
        if (!fileSystemService.DirectoryExists(trainingDataDir))
        {
            throw new DataNotFoundException("The training data directory does not exist");
        }

        // Load each training data file
        foreach (string dataId in dataIds)
        {
            IDocument<TrainingData> trainingDataDoc = await conn.FetchAsync<TrainingData>(
                TrainingData.GetDocId(projectId, dataId)
            );
            if (!trainingDataDoc.IsLoaded)
            {
                // Skip if the document does not exist
                continue;
            }

            // Get the filename without the "?t=12345" query string
            string fileName = Path.GetFileName(trainingDataDoc.Data.FileUrl);
            if (fileName.Contains('?', StringComparison.OrdinalIgnoreCase))
            {
                fileName = fileName.Split('?').First();
            }

            string path = Path.Join(trainingDataDir, fileName);
            if (!fileSystemService.FileExists(path))
            {
                // Skip if the file does not exist
                continue;
            }

            // Load the CSV file
            await using Stream fileStream = fileSystemService.OpenFile(path, FileMode.Open);
            using StreamReader streamReader = new StreamReader(fileStream);
            using CsvReader csvReader = new CsvReader(streamReader, _csvConfiguration);

            // Generate the text segments
            var sourceSegments = new List<SFTextSegment>();
            var targetSegments = new List<SFTextSegment>();
            int segRef = 0;
            int skipRows = trainingDataDoc.Data.SkipRows;
            while (await csvReader.ReadAsync())
            {
                // Do not send data if there are too few columns
                if (csvReader.ColumnCount < 2)
                {
                    break;
                }

                // Skip rows, if we are supposed to
                if (skipRows > 0)
                {
                    skipRows--;
                    continue;
                }

                // Increment the segment reference counter
                segRef++;

                // Add the first column of this line to the source segments
                string sourceSegmentText = csvReader.GetField<string>(0);
                sourceSegments.Add(new SFTextSegment([segRef.ToString()], sourceSegmentText, false, false, false));

                // Add the second column of this line to the target segments
                string targetSegmentText = csvReader.GetField<string>(1);
                targetSegments.Add(new SFTextSegment([segRef.ToString()], targetSegmentText, false, false, false));
            }

            // Generate the ISFText objects, and add to the appropriate collections
            sourceTexts.Add(new SFTrainingText { Id = dataId, Segments = sourceSegments });
            targetTexts.Add(new SFTrainingText { Id = dataId, Segments = targetSegments });
        }
    }

    /// <summary>
    /// Saves the training data to the file system, performing conversion if necessary
    /// </summary>
    /// <param name="userId">The user identifier</param>
    /// <param name="projectId">The project identifier.</param>
    /// <param name="dataId">The data identifier.</param>
    /// <param name="path">The path to the temporary file.</param>
    /// <returns>The relative URL to the file.</returns>
    /// <exception cref="DataNotFoundException">The project does not exist.</exception>
    /// <exception cref="ForbiddenException">The user does not have access to upload.</exception>
    /// <exception cref="FormatException">The data id or CSV file were not in the correct format.</exception>
    public async Task<Uri> SaveTrainingDataAsync(string userId, string projectId, string dataId, string path)
    {
        await using IConnection conn = await realtimeService.ConnectAsync(userId);
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        MachineApi.EnsureProjectPermission(userId, projectDoc.Data);

        if (!StringUtils.ValidateId(dataId))
        {
            throw new FormatException($"{nameof(dataId)} is not a valid id.");
        }

        string outputPath = GetTrainingDataFilePath(userId, projectDoc.Id, dataId);

        // Delete the existing file, if it exists
        if (fileSystemService.FileExists(outputPath))
        {
            fileSystemService.DeleteFile(outputPath);
        }

        // Validate the file, and convert to CSV if required
        await ConvertToCsvAsync(path, outputPath);

        // Return the URL to the file
        string outputFileName = Path.GetFileName(outputPath);
        var uri = new Uri(
            $"/assets/{DirectoryName}/{projectId}/{outputFileName}?t={DateTime.UtcNow.ToFileTime()}",
            UriKind.Relative
        );
        return uri;
    }

    /// <summary>
    /// Converts a file to a CSV file
    /// </summary>
    /// <param name="path">The file to convert</param>
    /// <param name="outputPath">The path to the output file</param>
    /// <returns>An asynchronous task.</returns>
    /// <exception cref="FormatException">
    /// The file does not have a valid extension, or it does not have two columns.
    /// </exception>
    /// <remarks>If the file is tab delimited or a CSV file, it will just be relocated to the new path.</remarks>
    private async Task ConvertToCsvAsync(string path, string outputPath)
    {
        string extension = Path.GetExtension(path).ToUpperInvariant();
        switch (extension)
        {
            case ".CSV":
            case ".TSV":
            case ".TXT":
                {
                    // Ensure that there are only two columns
                    await using (Stream fileStream = fileSystemService.OpenFile(path, FileMode.Open))
                    {
                        using StreamReader streamReader = new StreamReader(fileStream);
                        using CsvReader csvReader = new CsvReader(streamReader, _csvConfiguration);
                        await csvReader.ReadAsync();
                        if (csvReader.ColumnCount != 2)
                        {
                            throw new FormatException("The CSV file does not contain two columns");
                        }
                    }

                    // Relocate the temporary file to the new directory
                    fileSystemService.MoveFile(path, outputPath);
                }
                break;
            case ".XLS":
                {
                    // Load the Excel 97-2003 spreadsheet
                    await using Stream fileStream = fileSystemService.OpenFile(path, FileMode.Open);
                    using IWorkbook workbook = new HSSFWorkbook(fileStream);
                    await using Stream outputStream = fileSystemService.CreateFile(outputPath);
                    await ConvertExcelToCsvAsync(workbook, outputStream);
                }
                break;
            case ".XLSX":
                {
                    // Load the Excel 2007+ spreadsheet
                    await using Stream fileStream = fileSystemService.OpenFile(path, FileMode.Open);
                    using IWorkbook workbook = new XSSFWorkbook(fileStream);
                    await using Stream outputStream = fileSystemService.CreateFile(outputPath);
                    await ConvertExcelToCsvAsync(workbook, outputStream);
                }
                break;
            default:
                throw new FormatException();
        }
    }

    /// <summary>
    /// Gets the path to the training data file
    /// </summary>
    /// <param name="userId">The user identifier.</param>
    /// <param name="projectId">The SF project identifier.</param>
    /// <param name="dataId">The Data identifier from the TrainingData document.</param>
    /// <returns>The absolute path to the training data file.</returns>
    private string GetTrainingDataFilePath(string userId, string projectId, string dataId)
    {
        // Sanitise input
        userId = Path.GetInvalidFileNameChars()
            .Aggregate(userId, (current, c) => current.Replace(c.ToString(), string.Empty));
        projectId = Path.GetInvalidFileNameChars()
            .Aggregate(projectId, (current, c) => current.Replace(c.ToString(), string.Empty));
        dataId = Path.GetInvalidFileNameChars()
            .Aggregate(dataId, (current, c) => current.Replace(c.ToString(), string.Empty));

        // Ensure that the training data directory exists
        string trainingDataDir = Path.Join(siteOptions.Value.SiteDir, DirectoryName, projectId);
        if (!fileSystemService.DirectoryExists(trainingDataDir))
        {
            fileSystemService.CreateDirectory(trainingDataDir);
        }

        // Return the full path
        return Path.Join(trainingDataDir, $"{userId}_{dataId}.csv");
    }
}
