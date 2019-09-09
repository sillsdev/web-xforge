using System.Linq;
using System.Collections.Generic;
using System.ComponentModel;
using System.Threading.Tasks;
using Microsoft.Extensions.Options;
using MongoDB.Bson;
using MongoDB.Driver;
using SIL.Machine.Corpora;
using SIL.Machine.Tokenization;
using SIL.Machine.WebApi.Services;
using SIL.XForge.Configuration;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// This class represents a Machine text corpus for a SF project. It is used during batch training of the Machine
    /// translation engine.
    /// </summary>
    public class SFTextCorpusFactory : ITextCorpusFactory
    {
        private readonly IMongoClient _mongoClient;
        private readonly IOptions<DataAccessOptions> _dataAccessOptions;
        private readonly IRealtimeService _realtimeService;

        public SFTextCorpusFactory(IOptions<DataAccessOptions> dataAccessOptions, IRealtimeService realtimeService)
        {
            _dataAccessOptions = dataAccessOptions;
            _mongoClient = new MongoClient(dataAccessOptions.Value.ConnectionString);
            _realtimeService = realtimeService;
        }

        public async Task<ITextCorpus> CreateAsync(IEnumerable<string> projects, TextCorpusType type)
        {
            return new DictionaryTextCorpus(await CreateTextsAsync(projects, type));
        }

        private async Task<IReadOnlyList<IText>> CreateTextsAsync(IEnumerable<string> projects,
            TextCorpusType type)
        {
            StringTokenizer wordTokenizer = new LatinWordTokenizer();
            IMongoDatabase database = _mongoClient.GetDatabase(_dataAccessOptions.Value.MongoDatabaseName);
            IMongoCollection<BsonDocument> textDataColl = database.GetCollection<BsonDocument>(
                _realtimeService.GetCollectionName<TextData>());
            var texts = new List<IText>();
            foreach (string projectId in projects)
            {
                TextType textType;
                switch (type)
                {
                    case TextCorpusType.Source:
                        textType = TextType.Source;
                        break;
                    case TextCorpusType.Target:
                        textType = TextType.Target;
                        break;
                    default:
                        throw new InvalidEnumArgumentException(nameof(type), (int)type, typeof(TextType));
                }

                var project = await _realtimeService.GetSnapshotAsync<SFProject>(projectId);

                foreach (TextInfo text in project.Texts.Where(t => t.HasSource))
                {
                    foreach (Chapter chapter in text.Chapters)
                    {
                        string id = TextInfo.GetTextDocId(projectId, text.BookId, chapter.Number, textType);
                        FilterDefinition<BsonDocument> filter = Builders<BsonDocument>.Filter.Eq("_id", id);
                        BsonDocument doc = await textDataColl.Find(filter).FirstOrDefaultAsync();
                        if (doc != null)
                        {
                            texts.Add(new SFScriptureText(wordTokenizer, projectId, text.BookId, chapter.Number,
                                doc));
                        }
                    }
                }
            }

            return texts;
        }
    }
}
