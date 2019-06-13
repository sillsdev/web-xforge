namespace SIL.XForge.Configuration
{
    public class DataAccessOptions
    {
        public string ConnectionString { get; set; } = "mongodb://localhost:27017";
        public string MongoDatabaseName { get; set; } = "xforge";
        public string JobDatabaseName { get; set; }
        public string Prefix { get; set; }
    }
}
