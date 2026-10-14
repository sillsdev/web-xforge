using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using CsvHelper;
using CsvHelper.Configuration;
using ExcelDataReader;
using SIL.XForge.Realtime;
using SIL.XForge.Realtime.Json0;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services;

public class TrainingDataService(
    IFileSystemService fileSystemService,
    ISFProjectRights projectRights,
    IRealtimeService realtimeService,
    IStorageProvider storageProvider
) : ITrainingDataService
{
    /// <summary>
    /// The training directory name. This is not the full path to the directory.
    /// </summary>
    public const string DirectoryName = "training-data";
    private const int NumTrainingDataColumns = 2;

    private static readonly CsvConfiguration _csvConfiguration = new CsvConfiguration(CultureInfo.InvariantCulture)
    {
        BadDataFound = null,
        DetectColumnCountChanges = true,
        DetectDelimiter = true,
        HasHeaderRecord = false,
    };

    /// <summary>
    /// Converts an Excel file to a two column CSV file.
    /// </summary>
    /// <param name="excelStream">The stream containing the Excel file. The stream will be left open.</param>
    /// <param name="outputStream">The stream to write the CSV file to. The stream will be left open.</param>
    /// <returns>An asynchronous task.</returns>
    /// <exception cref="FormatException">The Excel file does not contain two columns of data</exception>
    public async Task ConvertExcelToCsvAsync(Stream excelStream, Stream outputStream)
    {
        List<(string, string)> data = [];
        using IExcelDataReader reader = ExcelReaderFactory.CreateReader(excelStream);
        while (reader.Read())
        {
            // Explicitly retrieve the data from the first two columns. If a third columns exists
            // in the spreadsheet we do not want that column to be interpreted as data which could
            // happen if the first column of a row is empty.
            string firstColumnData = reader.GetValue(0)?.ToString()?.Trim() ?? string.Empty;
            string secondColumnData = reader.GetValue(1)?.ToString()?.Trim() ?? string.Empty;
            if (string.IsNullOrEmpty(firstColumnData) || string.IsNullOrEmpty(secondColumnData))
            {
                if (string.IsNullOrEmpty(firstColumnData) && string.IsNullOrEmpty(secondColumnData))
                    continue;
                // One column has data missing
                throw new FormatException("The Excel file contains a row with fewer than two columns");
            }
            data.Add((firstColumnData, secondColumnData));
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

    public async Task MarkFileDeleted(string userId, string projectId, string fileId)
    {
        await using IConnection conn = await realtimeService.ConnectAsync(userId);
        IDocument<SFProject> projectDoc = await conn.FetchAsync<SFProject>(projectId);
        if (!projectDoc.IsLoaded)
        {
            throw new DataNotFoundException("The project does not exist.");
        }

        IDocument<TrainingData> trainingDataDoc = await conn.FetchAsync<TrainingData>(
            TrainingData.GetDocId(projectId, fileId)
        );
        if (!trainingDataDoc.IsLoaded)
        {
            throw new DataNotFoundException("The training data does not exist.");
        }

        if (
            !projectRights.HasRight(
                projectDoc.Data,
                userId,
                SFProjectDomain.TrainingData,
                Operation.Edit,
                trainingDataDoc.Data
            )
        )
        {
            throw new ForbiddenException();
        }

        await trainingDataDoc.SubmitJson0OpAsync(op => op.Set(td => td.Deleted, true));
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

        // Ensure permission to view training data
        if (!projectRights.HasRight(projectDoc.Data, userId, SFProjectDomain.TrainingData, Operation.View))
        {
            throw new ForbiddenException();
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

            // Load the CSV file from the storage provider
            await using Stream fileStream = await storageProvider.GetFileAsync(DirectoryName, projectId, fileName);
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
                string sourceSegmentText = csvReader.GetField<string>(0) ?? string.Empty;
                sourceSegments.Add(new SFTextSegment([segRef.ToString()], sourceSegmentText, false, false, false));

                // Add the second column of this line to the target segments
                string targetSegmentText = csvReader.GetField<string>(1) ?? string.Empty;
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

        // Ensure permission to create training data
        if (!projectRights.HasRight(projectDoc.Data, userId, SFProjectDomain.TrainingData, Operation.Create))
        {
            throw new ForbiddenException();
        }

        if (!StringUtils.ValidateId(dataId))
        {
            throw new FormatException($"{nameof(dataId)} is not a valid id.");
        }

        // Validate the file, and convert to CSV if required
        string outputPath = Path.Join(Path.GetTempPath(), Path.GetRandomFileName());
        await ConvertToCsvAsync(path, outputPath);

        // Upload and return the URL to the file
        return await storageProvider.PutFileAsync(outputPath, DirectoryName, projectId, $"{userId}_{dataId}.csv");
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
                        if (csvReader.ColumnCount < NumTrainingDataColumns)
                        {
                            throw new FormatException("The CSV file does not contain two columns");
                        }

                        // Detect if a row has fewer than two columns of data
                        while (await csvReader.ReadAsync())
                        {
                            if (csvReader.Parser.Record!.All(string.IsNullOrEmpty))
                            {
                                // Skip empty rows
                                continue;
                            }
                            int[] columnsToCheck = [0, 1];
                            if (
                                csvReader.ColumnCount < NumTrainingDataColumns
                                || columnsToCheck.Any(i => string.IsNullOrEmpty(csvReader.Parser.Record?[i]))
                            )
                            {
                                throw new FormatException("The CSV file contains a row with fewer than two columns");
                            }
                        }
                    }

                    // Relocate the temporary file to the new directory
                    fileSystemService.MoveFile(path, outputPath);
                }
                break;
            case ".XLS":
            case ".XLSX":
                {
                    // Load the Excel spreadsheet
                    await using Stream fileStream = fileSystemService.OpenFile(path, FileMode.Open);
                    await using Stream outputStream = fileSystemService.CreateFile(outputPath);
                    await ConvertExcelToCsvAsync(fileStream, outputStream);
                }
                break;
            default:
                throw new FormatException();
        }

        // Clean up the old file
        if (fileSystemService.FileExists(path))
        {
            fileSystemService.DeleteFile(path);
        }
    }
}
