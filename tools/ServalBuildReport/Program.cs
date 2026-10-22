using System.Diagnostics;
using System.Runtime.InteropServices;
using Duende.AccessTokenManagement;
using Duende.IdentityModel.Client;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using MiniExcelLibs;
using Serval.Client;
using IConfiguration = Microsoft.Extensions.Configuration.IConfiguration;

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

// Create row data structures
List<DataRow> dataRows = [];
Dictionary<DateTime, JobStates> summary = [];
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
            dataRows.Add(
                new DataRow
                {
                    ProjectId = translationEngine.Name ?? string.Empty,
                    TranslationEngineId = translationEngine.Id,
                    BuildId = build.Id,
                    Date = dateTime.ToString("yyyy-MM-dd"),
                    State = build.State.ToString(),
                    Message = build.Message,
                }
            );

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

Console.WriteLine();

// Map summary dictionary to a list of row objects
List<SummaryRow> summaryRows =
[
    .. summary
        .Keys.OrderBy(d => d)
        .Select(dateTime => new SummaryRow
        {
            Date = dateTime.ToString("yyyy-MM-dd"),
            Completed = summary[dateTime].Completed,
            Faulted = summary[dateTime].Faulted,
            Canceled = summary[dateTime].Canceled,
        }),
];

// Construct multi-sheet dictionary
var sheets = new Dictionary<string, object> { { "Summary", summaryRows }, { "Data", dataRows } };

// Write the workbook
string spreadsheetPath = Path.Join(Path.GetTempPath(), $"{environment}.xlsx");
MiniExcel.SaveAs(spreadsheetPath, sheets);

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
                client.TokenEndpoint = new Uri(servalOptions.TokenUrl, UriKind.Absolute);
                client.ClientId = ClientId.Parse(servalOptions.ClientId);
                client.ClientSecret = ClientSecret.Parse(servalOptions.ClientSecret);
                client.Parameters = new Parameters { { "audience", servalOptions.Audience } };
            }
        );
    services.AddClientCredentialsHttpClient(
        httpClientName,
        ClientCredentialsClientName.Parse(tokenClientName),
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

internal class SummaryRow
{
    public string Date { get; set; } = string.Empty;
    public int Completed { get; set; }
    public int Faulted { get; set; }
    public int Canceled { get; set; }
}

internal class DataRow
{
    public string ProjectId { get; set; } = string.Empty;
    public string TranslationEngineId { get; set; } = string.Empty;
    public string BuildId { get; set; } = string.Empty;
    public string Date { get; set; } = string.Empty;
    public string State { get; set; } = string.Empty;
    public string? Message { get; set; }
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
