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
        new DictionaryTextCorpus(await CreateTextsAsync(projects, type, false));

    public async Task<ITextCorpus> CreateAsync(
        IEnumerable<string> projects,
        TextCorpusType type,
        bool includeBlankSegments
    ) => new DictionaryTextCorpus(await CreateTextsAsync(projects, type, includeBlankSegments));

    private async Task<IReadOnlyList<IText>> CreateTextsAsync(
        IEnumerable<string> projects,
        TextCorpusType type,
        bool includeBlankSegments
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
            var project = await _realtimeService.GetSnapshotAsync<SFProject>(projectId);
            if (string.IsNullOrWhiteSpace(project.TranslateConfig.Source?.ProjectRef))
            {
                throw new DataNotFoundException("The source project reference is missing");
            }

            string textCorpusProjectId;
            string paratextId;
            List<TextInfo> projectTexts = project.Texts.Where(t => t.HasSource).ToList();
            switch (type)
            {
                case TextCorpusType.Source:
                    textCorpusProjectId = project.TranslateConfig.Source.ProjectRef;
                    paratextId = project.TranslateConfig.Source.ParatextId;
                    break;

                case TextCorpusType.Target:
                    textCorpusProjectId = projectId;
                    paratextId = project.ParatextId;
                    break;

                default:
                    throw new InvalidEnumArgumentException(nameof(type), (int)type, typeof(TextCorpusType));
            }

            foreach (TextInfo text in projectTexts)
            {
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
                                includeBlankSegments,
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
