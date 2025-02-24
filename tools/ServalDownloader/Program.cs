using System.Diagnostics;
using System.Runtime.InteropServices;
using Duende.IdentityModel.Client;
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
ServiceProvider services = SetupServices();
IDataFilesClient dataFilesClient = services.GetService<IDataFilesClient>()!;
ICorporaClient corporaClient = services.GetService<ICorporaClient>()!;
ITranslationEnginesClient translationEnginesClient = services.GetService<ITranslationEnginesClient>()!;

// Set up the translation engine directory and get the translation engine
string translationEngineId = args[0];
string translationEnginePath = Path.Combine(Path.GetTempPath(), translationEngineId);
Directory.CreateDirectory(translationEnginePath);
TranslationEngine translationEngine = await translationEnginesClient.GetAsync(translationEngineId);
if (translationEngine.Type != "nmt")
{
    Console.WriteLine("You can only download an NMT project");
    return;
}

// Download every file for every legacy corpus
#pragma warning disable CS0612 // Type or member is obsolete
foreach (TranslationCorpus corpus in await translationEnginesClient.GetAllCorporaAsync(translationEngineId))
#pragma warning restore CS0612 // Type or member is obsolete
{
    string corpusPath = Path.Combine(translationEnginePath, corpus.Id);
    Directory.CreateDirectory(corpusPath);
    foreach (TranslationCorpusFile sourceFile in corpus.SourceFiles)
    {
        // Create the source directory
        string sourcePath = Path.Combine(corpusPath, "source");
        Directory.CreateDirectory(sourcePath);

        // Get the file extension
        DataFile dataFile = await dataFilesClient.GetAsync(sourceFile.File.Id);
        string extension = dataFile.Format == FileFormat.Paratext ? ".zip" : ".txt";

        // Download the file
        FileResponse file = await dataFilesClient.DownloadAsync(sourceFile.File.Id);

        // Write the file
        string path = Path.Combine(sourcePath, $"{sourceFile.TextId}_({sourceFile.File.Id}){extension}");
        Console.WriteLine($"Writing {path}...");
        await using FileStream fileStream = new FileStream(path, FileMode.Create, FileAccess.Write);
        file.Stream.CopyTo(fileStream);
    }

    foreach (TranslationCorpusFile targetFile in corpus.TargetFiles)
    {
        string targetPath = Path.Combine(corpusPath, "target");
        Directory.CreateDirectory(targetPath);

        // Get the file extension
        DataFile dataFile = await dataFilesClient.GetAsync(targetFile.File.Id);
        string extension = dataFile.Format == FileFormat.Paratext ? ".zip" : ".txt";

        // Download the file
        FileResponse file = await dataFilesClient.DownloadAsync(targetFile.File.Id);

        // Write the file
        string path = Path.Combine(targetPath, $"{targetFile.TextId}_({targetFile.File.Id}){extension}");
        Console.WriteLine($"Writing {path}...");
        await using FileStream fileStream = new FileStream(path, FileMode.Create, FileAccess.Write);
        file.Stream.CopyTo(fileStream);
    }
}

// Download every file for every parallel corpus
foreach (
    TranslationParallelCorpus parallelCorpus in await translationEnginesClient.GetAllParallelCorporaAsync(
        translationEngineId
    )
)
{
    string parallelCorpusPath = Path.Combine(translationEnginePath, parallelCorpus.Id);
    Directory.CreateDirectory(parallelCorpusPath);
    foreach (ResourceLink sourceCorpus in parallelCorpus.SourceCorpora)
    {
        // Create the source directory
        string sourcePath = Path.Combine(parallelCorpusPath, "source");
        Directory.CreateDirectory(sourcePath);

        Corpus corpus = await corporaClient.GetAsync(sourceCorpus.Id);
        foreach (CorpusFile corpusFile in corpus.Files)
        {
            // Get the file extension
            DataFile dataFile = await dataFilesClient.GetAsync(corpusFile.File.Id);
            string extension = dataFile.Format == FileFormat.Paratext ? ".zip" : ".txt";

            // Download the file
            FileResponse file = await dataFilesClient.DownloadAsync(corpusFile.File.Id);

            // Write the file
            string path = Path.Combine(sourcePath, $"{corpusFile.TextId}_({corpusFile.File.Id}){extension}");
            Console.WriteLine($"Writing {path}...");
            await using FileStream fileStream = new FileStream(path, FileMode.Create, FileAccess.Write);
            file.Stream.CopyTo(fileStream);
        }
    }

    foreach (ResourceLink sourceCorpus in parallelCorpus.SourceCorpora)
    {
        // Create the target directory
        string targetPath = Path.Combine(parallelCorpusPath, "target");
        Directory.CreateDirectory(targetPath);

        Corpus corpus = await corporaClient.GetAsync(sourceCorpus.Id);
        foreach (CorpusFile corpusFile in corpus.Files)
        {
            // Get the file extension
            DataFile dataFile = await dataFilesClient.GetAsync(corpusFile.File.Id);
            string extension = dataFile.Format == FileFormat.Paratext ? ".zip" : ".txt";

            // Download the file
            FileResponse file = await dataFilesClient.DownloadAsync(corpusFile.File.Id);

            // Write the file
            string path = Path.Combine(targetPath, $"{corpusFile.TextId}_({corpusFile.File.Id}){extension}");
            Console.WriteLine($"Writing {path}...");
            await using FileStream fileStream = new FileStream(path, FileMode.Create, FileAccess.Write);
            file.Stream.CopyTo(fileStream);
        }
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
    const string tokenClientName = "serval-api-token";

    ConfigurationBuilder configurationBuilder = new ConfigurationBuilder();
    IConfiguration configuration = configurationBuilder
        .AddJsonFile("appsettings.json", false, true)
        .AddUserSecrets<Program>()
        .Build();
    ServalOptions servalOptions = configuration.GetSection("Serval").Get<ServalOptions>()!;

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
    services.AddSingleton<ICorporaClient, CorporaClient>(sp =>
    {
        // Instantiate the corpora client with our named HTTP client
        var factory = sp.GetService<IHttpClientFactory>();
        var httpClient = factory!.CreateClient(httpClientName);
        return new CorporaClient(httpClient);
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

internal class ServalOptions
{
    public string ApiServer { get; init; } = string.Empty;
    public string Audience { get; init; } = string.Empty;
    public string ClientId { get; init; } = string.Empty;
    public string ClientSecret { get; init; } = string.Empty;
    public string TokenUrl { get; init; } = string.Empty;
}
