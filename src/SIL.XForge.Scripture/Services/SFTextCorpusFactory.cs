using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using SIL.Machine.Corpora;
using SIL.Machine.Tokenization;
using SIL.Machine.WebApi.Services;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services;

/// <summary>
/// This class represents a Machine text corpus for a SF project. It is used during batch training of the Machine
/// translation engine.
/// </summary>
public class SFTextCorpusFactory : ISFTextCorpusFactory, ITextCorpusFactory
{
    private readonly IMongoClient _mongoClient;
    private readonly IOptions<DataAccessOptions> _dataAccessOptions;
    private readonly IRealtimeService _realtimeService;
    private readonly IOptions<SiteOptions> _siteOptions;
    private readonly IFileSystemService _fileSystemService;

    public SFTextCorpusFactory(
        IOptions<DataAccessOptions> dataAccessOptions,
        IRealtimeService realtimeService,
        IOptions<SiteOptions> siteOptions,
        IFileSystemService fileSystemService
    )
    {
        _dataAccessOptions = dataAccessOptions;
        _mongoClient = new MongoClient(dataAccessOptions.Value.ConnectionString);
        _realtimeService = realtimeService;
        _siteOptions = siteOptions;
        _fileSystemService = fileSystemService;
    }

    public async Task<ITextCorpus> CreateAsync(IEnumerable<string> projects, TextCorpusType type) =>
        new DictionaryTextCorpus(
            await CreateTextsAsync(
                projects,
                type,
                preTranslate: false,
                useAlternateTrainingSource: false,
                new BuildConfig()
            )
        );

    public async Task<ITextCorpus> CreateAsync(
        IEnumerable<string> projects,
        TextCorpusType type,
        bool preTranslate,
        bool useAlternateTrainingSource,
        BuildConfig buildConfig
    ) =>
        new DictionaryTextCorpus(
            await CreateTextsAsync(projects, type, preTranslate, useAlternateTrainingSource, buildConfig)
        );

    private async Task<IReadOnlyList<IText>> CreateTextsAsync(
        IEnumerable<string> projects,
        TextCorpusType type,
        bool preTranslate,
        bool useAlternateTrainingSource,
        BuildConfig buildConfig
    )
    {
        StringTokenizer wordTokenizer = new LatinWordTokenizer();
        IMongoDatabase database = _mongoClient.GetDatabase(_dataAccessOptions.Value.MongoDatabaseName);
        IMongoCollection<BsonDocument> textDataColl = database.GetCollection<BsonDocument>(
            _realtimeService.GetCollectionName<TextData>()
        );
        var texts = new List<IText>();
        foreach (string projectId in projects)
        {
            SFProject project = await _realtimeService.GetSnapshotAsync<SFProject>(projectId);
            List<TextInfo> projectTexts = project.Texts.Where(t => t.HasSource).ToList();
            List<int> books = new List<int>();
            string textCorpusProjectId;
            string paratextId;
            switch (type)
            {
                case TextCorpusType.Source:
                    if (
                        useAlternateTrainingSource
                        && project.TranslateConfig.DraftConfig.AlternateTrainingSource is not null
                    )
                    {
                        textCorpusProjectId = project.TranslateConfig.DraftConfig.AlternateTrainingSource.ProjectRef;
                        paratextId = project.TranslateConfig.DraftConfig.AlternateTrainingSource.ParatextId;
                    }
                    else if (preTranslate && project.TranslateConfig.DraftConfig.AlternateSource is not null)
                    {
                        textCorpusProjectId = project.TranslateConfig.DraftConfig.AlternateSource.ProjectRef;
                        paratextId = project.TranslateConfig.DraftConfig.AlternateSource.ParatextId;
                    }
                    else if (project.TranslateConfig.Source is not null)
                    {
                        textCorpusProjectId = project.TranslateConfig.Source.ProjectRef;
                        paratextId = project.TranslateConfig.Source.ParatextId;
                    }
                    else
                    {
                        throw new DataNotFoundException("The source project reference is missing");
                    }

                    // If we are pre-translating, get all source texts to generate all needed pre-translations
                    if (preTranslate)
                    {
                        var sourceProject = await _realtimeService.GetSnapshotAsync<SFProject>(textCorpusProjectId);
                        projectTexts = sourceProject.Texts;
                    }

                    // If we are using the alternate training source, the source will be all of the training books,
                    // otherwise it will be the training and translation lists combined without duplicates.
                    books.AddRange(
                        useAlternateTrainingSource
                            ? buildConfig.TrainingBooks
                            : buildConfig.TrainingBooks.Union(buildConfig.TranslationBooks)
                    );

                    break;

                case TextCorpusType.Target:
                    textCorpusProjectId = projectId;
                    paratextId = project.ParatextId;

                    // The target books will be both the training and translation lists combined without duplicates
                    books.AddRange(buildConfig.TrainingBooks.Union(buildConfig.TranslationBooks));
                    break;

                default:
                    throw new InvalidEnumArgumentException(nameof(type), (int)type, typeof(TextCorpusType));
            }

            foreach (TextInfo text in projectTexts.Where(t => books.Count == 0 || books.Contains(t.BookNum)))
            {
                // If we are not training a book, the segments in it must be empty
                bool doNotSendSegmentText =
                    preTranslate && type == TextCorpusType.Target && !buildConfig.TrainingBooks.Contains(text.BookNum);
                foreach (Chapter chapter in text.Chapters)
                {
                    string id = TextData.GetTextDocId(textCorpusProjectId, text.BookNum, chapter.Number);
                    FilterDefinition<BsonDocument> filter = Builders<BsonDocument>.Filter.Eq("_id", id);
                    BsonDocument doc = await textDataColl.Find(filter).FirstOrDefaultAsync();
                    if (doc != null && doc.TryGetValue("ops", out BsonValue ops) && ops as BsonArray != null)
                        texts.Add(
                            new SFScriptureText(
                                wordTokenizer,
                                projectId,
                                text.BookNum,
                                chapter.Number,
                                includeBlankSegments: preTranslate,
                                doNotSendSegmentText,
                                doc
                            )
                        );
                }
            }

            List<BiblicalTerm> biblicalTerms = await _realtimeService
                .QuerySnapshots<BiblicalTerm>()
                .Where(b => b.ProjectRef == textCorpusProjectId)
                .ToListAsync();
            if (biblicalTerms.Any())
            {
                texts.Add(new SFBiblicalTermsText(wordTokenizer, projectId, biblicalTerms));
            }
            else
            {
                // Use the legacy upload method for projects which do not yet have their biblical terms populated in Mongo
                string termRenderingsFileName = Path.Combine(
                    _siteOptions.Value.SiteDir,
                    "sync",
                    paratextId,
                    "target",
                    "TermRenderings.xml"
                );
                if (_fileSystemService.FileExists(termRenderingsFileName))
                {
                    await using Stream stream = _fileSystemService.OpenFile(termRenderingsFileName, FileMode.Open);
                    XDocument termRenderingsDoc = await XDocument.LoadAsync(
                        stream,
                        LoadOptions.None,
                        CancellationToken.None
                    );
                    texts.Add(new SFBiblicalTermsText(wordTokenizer, projectId, termRenderingsDoc));
                }
            }
        }

        return texts;
    }
}
