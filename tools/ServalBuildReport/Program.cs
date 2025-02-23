using System.Diagnostics;
using System.Runtime.InteropServices;
using Duende.IdentityModel.Client;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NPOI.SS.UserModel;
using NPOI.XSSF.UserModel;
using Serval.Client;

// The first argument must be the translation engine id
if (args.Length == 0 || string.IsNullOrWhiteSpace(args[0]))
{
    Console.WriteLine("You must specify whether you are reporting on QA or Prod");
    return;
}

// Clean up the input to allow QA, or Prod, or future options like Test
string environment = string.Join(string.Empty, args[0].ToLowerInvariant().Split(Path.GetInvalidFileNameChars()));
if (environment.Length > 2)
{
    environment = char.ToUpper(environment[0]) + environment[1..];
}
else if (string.IsNullOrWhiteSpace(environment))
{
    Console.WriteLine("You must specify a valid environment, such as Qa or Prod");
    return;
}

Console.WriteLine($"Reporting on {environment}. This will take some time.");

// Setup services
ServiceProvider services = SetupServices(environment);
ITranslationEnginesClient translationEnginesClient = services.GetService<ITranslationEnginesClient>()!;

// Set up the Spreadsheet
string spreadsheetPath = Path.Combine(Path.GetTempPath(), $"{environment}.xlsx");
using XSSFWorkbook workbook = new XSSFWorkbook();
await using FileStream fs = new FileStream(spreadsheetPath, FileMode.Create, FileAccess.Write);
int summarySheetRow = 0;
ISheet summarySheet = workbook.CreateSheet("Summary");
int dataSheetRow = 0;
ISheet dataSheet = workbook.CreateSheet("Data");

// Set up the date format
// See https://archive.org/details/microsoftexcel970000unse/page/426 for format codes
ICellStyle dateCellStyle = workbook.CreateCellStyle();
dateCellStyle.DataFormat = 0x0e; // Short Date

// Create the header rows
IRow row = summarySheet.CreateRow(summarySheetRow++);
row.CreateCell(0).SetCellValue("Date");
row.CreateCell(1).SetCellValue("Completed");
row.CreateCell(2).SetCellValue("Faulted");
row.CreateCell(3).SetCellValue("Canceled");

row = dataSheet.CreateRow(dataSheetRow++);
row.CreateCell(0).SetCellValue("ProjectId");
row.CreateCell(1).SetCellValue("TranslationEngineId");
row.CreateCell(2).SetCellValue("BuildId");
row.CreateCell(3).SetCellValue("Date");
row.CreateCell(4).SetCellValue("State");
row.CreateCell(5).SetCellValue("Message");

// Create the summary data structure
var summary = new Dictionary<DateTime, JobStates>();
Console.Write("Loading...");

// Iterate over every translation engine
IList<TranslationEngine> translationEngines = await translationEnginesClient.GetAllAsync();
int translationEngineCount = 0;
foreach (TranslationEngine translationEngine in translationEngines)
{
    // Overwrite the previous status
    translationEngineCount++;
    Console.SetCursorPosition(0, Console.CursorTop);
    Console.Write($"Loading Translation Engine {translationEngineCount} of {translationEngines.Count}");

    // We do not want SMT or Echo builds
    if (translationEngine.Type != "nmt")
    {
        continue;
    }

    // Iterate over every build in the translation engine
    foreach (TranslationBuild build in await translationEnginesClient.GetAllBuildsAsync(translationEngine.Id))
    {
        // Ensure that the build has finished
        if (build.DateFinished is not null)
        {
            DateTime dateTime = build.DateFinished.Value.UtcDateTime;
            row = dataSheet.CreateRow(dataSheetRow++);
            row.CreateCell(0).SetCellValue(translationEngine.Name);
            row.CreateCell(1).SetCellValue(translationEngine.Id);
            row.CreateCell(2).SetCellValue(build.Id);
            ICell dateCell = row.CreateCell(3);
            dateCell.SetCellValue(dateTime);
            dateCell.CellStyle = dateCellStyle;
            row.CreateCell(4).SetCellValue(build.State.ToString());
            row.CreateCell(5).SetCellValue(build.Message);
            if (!summary.TryGetValue(dateTime.Date, out JobStates? jobStates))
            {
                jobStates = new JobStates();
                summary.Add(dateTime.Date, jobStates);
            }

            switch (build.State)
            {
                case JobState.Completed:
                    jobStates.Completed++;
                    break;
                case JobState.Faulted:
                    jobStates.Faulted++;
                    break;
                case JobState.Canceled:
                    jobStates.Canceled++;
                    break;
            }
        }
    }
}

// Finish the data worksheet and console output
dataSheet.AutoSizeColumn(0);
dataSheet.AutoSizeColumn(1);
dataSheet.AutoSizeColumn(2);
dataSheet.AutoSizeColumn(3);
dataSheet.AutoSizeColumn(4);
Console.WriteLine();

// Write the summary
foreach (DateTime dateTime in summary.Keys.OrderBy(d => d))
{
    row = summarySheet.CreateRow(summarySheetRow++);
    ICell dateCell = row.CreateCell(0);
    dateCell.SetCellValue(dateTime);
    dateCell.CellStyle = dateCellStyle;
    row.CreateCell(1).SetCellValue(summary[dateTime].Completed);
    row.CreateCell(2).SetCellValue(summary[dateTime].Faulted);
    row.CreateCell(3).SetCellValue(summary[dateTime].Canceled);
}

// Finish the summary worksheet
summarySheet.AutoSizeColumn(0);

// Write the workbook
workbook.Write(fs);

// If we are on Windows, open the file in Explorer
if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
{
    Process.Start("explorer.exe", spreadsheetPath);
}
else
{
    Console.WriteLine($"The spreadsheet was written to: {spreadsheetPath}");
}

// Exit
return;

static ServiceProvider SetupServices(string environment)
{
    const string httpClientName = "serval-api";
    const string tokenClientName = "serval-api-token";

    ConfigurationBuilder configurationBuilder = new ConfigurationBuilder();
    IConfiguration configuration = configurationBuilder
        .AddJsonFile("appsettings.json", false, true)
        .AddUserSecrets<Program>()
        .Build();
    ServalOptions servalOptions = configuration.GetSection(environment).Get<ServalOptions>()!;

    var services = new ServiceCollection();
    services.AddDistributedMemoryCache();
    services
        .AddClientCredentialsTokenManagement()
        .AddClient(
            tokenClientName,
            client =>
            {
                client.TokenEndpoint = servalOptions.TokenUrl;
                client.ClientId = servalOptions.ClientId;
                client.ClientSecret = servalOptions.ClientSecret;
                client.Parameters = new Parameters { { "audience", servalOptions.Audience } };
            }
        );
    services.AddClientCredentialsHttpClient(
        httpClientName,
        tokenClientName,
        configureClient: client => client.BaseAddress = new Uri(servalOptions.ApiServer)
    );
    services.AddHttpClient(httpClientName).SetHandlerLifetime(TimeSpan.FromMinutes(5));
    services.AddSingleton<ITranslationEnginesClient, TranslationEnginesClient>(sp =>
    {
        // Instantiate the translation engines client with our named HTTP client
        var factory = sp.GetService<IHttpClientFactory>();
        var httpClient = factory!.CreateClient(httpClientName);
        return new TranslationEnginesClient(httpClient);
    });
    return services.BuildServiceProvider();
}

internal class ServalOptions
{
    public string ApiServer { get; init; } = string.Empty;
    public string Audience { get; init; } = string.Empty;
    public string ClientId { get; init; } = string.Empty;
    public string ClientSecret { get; init; } = string.Empty;
    public string TokenUrl { get; init; } = string.Empty;
}

internal class JobStates
{
    public int Completed { get; set; }
    public int Faulted { get; set; }
    public int Canceled { get; set; }
}
