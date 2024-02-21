using System.Diagnostics;
using System.Runtime.InteropServices;
using IdentityModel.Client;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Serval.Client;

// The first argument must be the translation engine id
if (args.Length == 0 || string.IsNullOrWhiteSpace(args[0]))
{
    Console.WriteLine("You must specify the translation engine id");
    return;
}

// Setup services
var services = SetupServices();
var dataFilesClient = services.GetService<IDataFilesClient>()!;
var translationEnginesClient = services.GetService<ITranslationEnginesClient>()!;

// Set up the translation engine directory and get the translation engine
string translationEngineId = args[0];
string translationEnginePath = Path.Combine(Path.GetTempPath(), translationEngineId);
Directory.CreateDirectory(translationEnginePath);
var translationEngine = await translationEnginesClient.GetAsync(translationEngineId);
if (translationEngine.Type != "nmt")
{
    Console.WriteLine("You can only download an NMT project");
    return;
}

// Download every file for every corpus
foreach (var corpus in await translationEnginesClient.GetAllCorporaAsync(translationEngineId))
{
    string corpusPath = Path.Combine(translationEnginePath, corpus.Id);
    Directory.CreateDirectory(corpusPath);
    foreach (var sourceFile in corpus.SourceFiles)
    {
        // Create the source directory
        string sourcePath = Path.Combine(corpusPath, "source");
        Directory.CreateDirectory(sourcePath);

        // Download the file
        var file = await dataFilesClient.DownloadAsync(sourceFile.File.Id);

        // Write the file
        string path = Path.Combine(sourcePath, (sourceFile.TextId ?? sourceFile.File.Id) + ".txt");
        Console.WriteLine($"Writing {path}...");
        await using FileStream fileStream = new FileStream(path, FileMode.Create, FileAccess.Write);
        file.Stream.CopyTo(fileStream);
    }

    foreach (var targetFile in corpus.TargetFiles)
    {
        string targetPath = Path.Combine(corpusPath, "target");
        Directory.CreateDirectory(targetPath);

        // Download the file
        var file = await dataFilesClient.DownloadAsync(targetFile.File.Id);

        // Write the file
        string path = Path.Combine(targetPath, (targetFile.TextId ?? targetFile.File.Id) + ".txt");
        Console.WriteLine($"Writing {path}...");
        await using FileStream fileStream = new FileStream(path, FileMode.Create, FileAccess.Write);
        file.Stream.CopyTo(fileStream);
    }
}

// If we are on Windows, open the directory in Explorer
if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
{
    Process.Start("explorer.exe", translationEnginePath);
}

// Exit
return;

static ServiceProvider SetupServices()
{
    const string httpClientName = "serval-api";

    ConfigurationBuilder configurationBuilder = new ConfigurationBuilder();
    IConfiguration configuration = configurationBuilder
        .AddJsonFile("appsettings.json", false, true)
        .AddUserSecrets<Program>()
        .Build();
    ServalOptions servalOptions = configuration.GetSection("Serval").Get<ServalOptions>()!;

    var services = new ServiceCollection();
    services.AddAccessTokenManagement(options =>
    {
        options.Client.Clients.Add(
            httpClientName,
            new ClientCredentialsTokenRequest
            {
                Address = servalOptions.TokenUrl,
                ClientId = servalOptions.ClientId,
                ClientSecret = servalOptions.ClientSecret,
                Parameters = new Parameters { { "audience", servalOptions.Audience } },
            }
        );
    });
    services.AddClientAccessTokenHttpClient(
        httpClientName,
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
    services.AddSingleton<IDataFilesClient, DataFilesClient>(sp =>
    {
        // Instantiate the data files client with our named HTTP client
        var factory = sp.GetService<IHttpClientFactory>();
        var httpClient = factory!.CreateClient(httpClientName);
        return new DataFilesClient(httpClient);
    });
    return services.BuildServiceProvider();
}

public class ServalOptions
{
    public string ApiServer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public string ClientId { get; set; } = string.Empty;
    public string ClientSecret { get; set; } = string.Empty;
    public string TokenUrl { get; set; } = string.Empty;
}
