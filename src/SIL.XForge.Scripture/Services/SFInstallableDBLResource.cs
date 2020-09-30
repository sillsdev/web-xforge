using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Xml;
using System.Xml.XPath;
using Ionic.Zip;
using Paratext.Data;
using Paratext.Data.Archiving;
using Paratext.Data.Languages;
using Paratext.Data.ProjectFileAccess;
using Paratext.Data.RegistryServerAccess;
using PtxUtils;
using PtxUtils.Http;
using SIL.Extensions;
using SIL.IO;
using SIL.WritingSystems;
using SIL.XForge.Configuration;
using SIL.XForge.Models;
using SIL.XForge.Services;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// The Scripture Forge Installable DBL Resource Implementation.
    /// </summary>
    public class SFInstallableDBLResource : InstallableResource
    {
        /// <summary>
        /// The DBL folder name (in the zip file).
        /// </summary>
        private const string DBLFolderName = ".dbl";

        /// <summary>
        /// The DBL resource entries API endpoint.
        /// </summary>
        private const string DBLResourceEntriesApiCall = "api/resource_entries";

        /// <summary>
        /// The base URL.
        /// </summary>
        private readonly string _baseUrl;

        /// <summary>
        /// The file system service.
        /// </summary>
        private readonly IFileSystemService _fileSystemService;

        /// <summary>
        /// The paratext options.
        /// </summary>
        private readonly ParatextOptions _paratextOptions;

        /// <summary>
        /// The rest client factory.
        /// </summary>
        private readonly IRESTClientFactory<IRESTClient> _restClientFactory;

        /// <summary>
        /// The user secret.
        /// </summary>
        private readonly UserSecret _userSecret;

        /// <summary>
        /// Initializes a new instance of the <see cref="SFInstallableDBLResource" /> class.
        /// </summary>
        /// <param name="userSecret">The user secret.</param>
        /// <param name="paratextOptions">The paratext options.</param>
        /// <param name="restClientFactory">The rest client factory.</param>
        /// <param name="fileSystemService">The file system service.</param>
        /// <remarks>
        /// This is a convenience constructor for unit tests.
        /// </remarks>
        internal SFInstallableDBLResource(UserSecret userSecret, ParatextOptions paratextOptions, IRESTClientFactory<IRESTClient> restClientFactory, IFileSystemService fileSystemService)
            : this(userSecret, paratextOptions, restClientFactory, fileSystemService, new ParatextProjectDeleter(), new ParatextMigrationOperations(), new ParatextZippedResourcePasswordProvider(paratextOptions))
        {
        }

        /// <summary>
        /// Initializes a new instance of the <see cref="SFInstallableDBLResource" /> class.
        /// </summary>
        /// <param name="userSecret">The user secret.</param>
        /// <param name="paratextOptions">The paratext options.</param>
        /// <param name="restClientFactory">The rest client factory.</param>
        /// <param name="fileSystemService">The file system service.</param>
        /// <param name="projectDeleter">The project deleter.</param>
        /// <param name="migrationOperations">The migration operations.</param>
        /// <param name="passwordProvider">The password provider.</param>
        /// <param name="baseUrl">(Optional) The base URL.</param>
        /// <exception cref="ArgumentNullException">restClientFactory</exception>
        private SFInstallableDBLResource(UserSecret userSecret, ParatextOptions paratextOptions, IRESTClientFactory<IRESTClient> restClientFactory, IFileSystemService fileSystemService, IProjectDeleter projectDeleter, IMigrationOperations migrationOperations, IZippedResourcePasswordProvider passwordProvider, string baseUrl = null)
            : base(projectDeleter, migrationOperations, passwordProvider)
        {
            this._userSecret = userSecret;
            this._paratextOptions = paratextOptions;
            this._restClientFactory = restClientFactory;
            this._fileSystemService = fileSystemService;
            if (this._restClientFactory == null)
            {
                throw new ArgumentNullException(nameof(restClientFactory));
            }
            else if (this._fileSystemService == null)
            {
                throw new ArgumentNullException(nameof(fileSystemService));
            }

            this._baseUrl = string.IsNullOrWhiteSpace(baseUrl) ? InternetAccess.ParatextDBLServer : baseUrl;
        }

        /// <summary>
        /// Gets or sets the DBL source URL.
        /// </summary>
        /// <value>
        /// The DBL source URL.
        /// </value>
        /// <remarks>
        /// This URL may or may not require authentication, depending on the resource.
        /// </remarks>
        public string DBLSourceUrl { get; set; }

        /// <summary>
        /// Return a list of resources which this user is allowed to install from DBL.
        /// If we cannot contact DBL, return an empty list.
        /// </summary>
        /// <param name="userSecret">The user secret.</param>
        /// <param name="paratextOptions">The paratext options.</param>
        /// <param name="restClientFactory">The rest client factory.</param>
        /// <param name="fileSystemService">The file system service.</param>
        /// <param name="baseUrl">The base URL.</param>
        /// <returns></returns>
        /// <exception cref="ArgumentNullException">
        /// restClientFactory
        /// or
        /// userSecret
        /// </exception>
        public static IEnumerable<SFInstallableDBLResource> GetInstallableDBLResources(UserSecret userSecret, ParatextOptions paratextOptions, IRESTClientFactory<IRESTClient> restClientFactory, IFileSystemService fileSystemService, string baseUrl = null)
        {
            // Parameter check (just like the constructor)
            if (restClientFactory == null)
            {
                throw new ArgumentNullException(nameof(restClientFactory));
            }
            else if (userSecret == null)
            {
                throw new ArgumentNullException(nameof(userSecret));
            }

            var client = restClientFactory.Create(string.Empty, ApplicationProduct.DefaultVersion);
            // TODO: Authentication!
            // If authenticated, use the following call
            // string response = client.Get(RESTClient.BuildCgiCall(BuildDBLResourceEntriesUrl(this._baseUrl) + ".xml",
            //    new Dictionary<string, string>
            //    {
            //        {"username", user.Name} /* username included for logging purposes only */
            //    }));
            baseUrl = string.IsNullOrWhiteSpace(baseUrl) ? InternetAccess.ParatextDBLServer : baseUrl;
            string response = client.Get(BuildDBLResourceEntriesUrl(baseUrl) + ".xml");
            var resources = ConvertXmlResponseToInstallableDblResources(baseUrl, response, restClientFactory, fileSystemService, DateTime.Now, userSecret, paratextOptions, new ParatextProjectDeleter(), new ParatextMigrationOperations(), new ParatextZippedResourcePasswordProvider(paratextOptions));
            return resources;
        }

        /// <summary>
        /// Extracts the resource to a directory.
        /// </summary>
        /// <param name="path">The path.</param>
        /// <exception cref="ArgumentNullException">
        /// path
        /// or
        /// DBLEntryUid
        /// or
        /// Name
        /// </exception>
        /// <remarks>
        /// After the resource is extracted, it can be a source or target.
        /// </remarks>
        public void ExtractToDirectory(string path)
        {
            // Check parameters
            if (string.IsNullOrWhiteSpace(path))
            {
                throw new ArgumentNullException(nameof(path));
            }
            else if (string.IsNullOrWhiteSpace(this.DBLEntryUid))
            {
                throw new ArgumentNullException(nameof(this.DBLEntryUid));
            }
            else if (string.IsNullOrWhiteSpace(this.Name))
            {
                throw new ArgumentNullException(nameof(this.Name));
            }

            string resourceFile = ScrTextCollection.GetResourcePath(this.ExistingScrText, this.Name, this.DBLEntryUid);
            if (RobustFile.Exists(resourceFile))
            {
                using var zipFile = ZipFile.Read(resourceFile);
                zipFile.Password = this._passwordProvider?.GetPassword();
                zipFile.ExtractAll(path, ExtractExistingFileAction.DoNotOverwrite);
            }
        }

        /// <summary>
        /// Download the files for this project from DBL into sourceDirectory and then
        /// copy them to the destination directory.
        /// Install should throw an Exception with an appropriate message if something goes wrong.
        /// </summary>
        /// <returns>
        ///   <c>true</c> if fonts were installed; otherwise <c>false</c>.
        /// </returns>
        /// <exception cref="ArgumentNullException">DBLEntryUid
        /// or
        /// DBLSourceUrl
        /// or
        /// Name</exception>
        public override bool Install()
        {
            // Easier to check parameters here than fill the temp directory with files
            // NOTE: This is not an exhaustive list of the required parameters!
            //       You will need to refer to InstallableResource.Install() for that.
            if (string.IsNullOrWhiteSpace(this.DBLEntryUid))
            {
                throw new ArgumentNullException(nameof(this.DBLEntryUid));
            }
            else if (string.IsNullOrWhiteSpace(this.DBLSourceUrl))
            {
                throw new ArgumentNullException(nameof(this.DBLSourceUrl));
            }
            else if (string.IsNullOrWhiteSpace(this.Name))
            {
                throw new ArgumentNullException(nameof(this.Name));
            }

            sourceDirectory = this.CreateTempSourceDirectory();
            string filePath = Path.Combine(sourceDirectory, this.Name + ProjectFileManager.resourceFileExtension);
            if (!this.GetFile(filePath))
            {
                if (RobustFile.Exists(filePath))
                {
                    // RobustFile only handles retries...
                    RobustFile.Delete(filePath);
                }

                return false;
            }

            bool result = base.Install();
            if (RobustFile.Exists(filePath))
            {
                RobustFile.Delete(filePath);
            }

            return result;
        }

        /// <summary>
        /// Gets the revision numbers for all installed resources.
        /// </summary>
        /// <returns>
        /// A dictionary where the resource id is the key, and the revision is the value.
        /// </returns>
        internal static IReadOnlyDictionary<string, int> GetInstalledResourceRevisions()
        {
            // Initialize variables
            Dictionary<string, int> resourceRevisions = new Dictionary<string, int>();
            string resourcesDirectory;

            // This can throw an error if the SettingsDirectory is not specified
            // If that is the case, we don't need to look at the FS anyway
            try
            {
                resourcesDirectory = ScrTextCollection.ResourcesDirectory;
            }
            catch (ArgumentNullException)
            {
                // Path.Combine() in ScrTextCollection will have thrown this error
                resourcesDirectory = string.Empty;
            }

            if (!string.IsNullOrWhiteSpace(resourcesDirectory) && Directory.Exists(resourcesDirectory))
            {
                foreach (string resourceFile in Directory.EnumerateFiles(ScrTextCollection.ResourcesDirectory,
                    "*" + ProjectFileManager.resourceFileExtension))
                {
                    // See if this a zip file, and if it contains the correct ID
                    try
                    {
                        // This only uses DotNetZip because ParatextData uses DotNetZip
                        // You could use System.IO.Compression if you wanted to
                        using var zipFile = ZipFile.Read(resourceFile);
                        // Zip files use forward slashes, even on Windows
                        const string idSearchPath = DBLFolderName + "/id/";
                        const string revisionSearchPath = DBLFolderName + "/revision/";
                        // These are the values that will comprise the KeyValuePair
                        string fileId = null;
                        int revision = 0;
                        foreach (var entry in zipFile)
                        {
                            if (string.IsNullOrWhiteSpace(fileId) && !entry.IsDirectory && entry.FileName.StartsWith(idSearchPath, StringComparison.OrdinalIgnoreCase))
                            {
                                fileId = entry.FileName.Split('/', StringSplitOptions.RemoveEmptyEntries).Last();
                            }
                            else if (revision == 0 && !entry.IsDirectory && entry.FileName.StartsWith(revisionSearchPath, StringComparison.OrdinalIgnoreCase))
                            {
                                if (!int.TryParse(entry.FileName.Split('/', StringSplitOptions.RemoveEmptyEntries).Last(), out revision))
                                {
                                    // An error occurred reading the revision
                                    revision = 0;
                                }
                            }

                            // If we have both a revision id, and a file id, then add these to the dictionary
                            if (!string.IsNullOrWhiteSpace(fileId) && revision != 0)
                            {
                                break;
                            }
                        }

                        // If we have a file id
                        if (!string.IsNullOrWhiteSpace(fileId))
                        {
                            // Ensure we have a revision
                            if (revision == 0)
                            {
                                revision = 1;
                            }

                            // Add the file id and revision to the dictionary
                            if (!resourceRevisions.ContainsKey(fileId))
                            {
                                resourceRevisions.Add(fileId, revision);
                            }
                        }
                    }
                    catch (Exception)
                    {
                        // If it is an erroneous zip file, we don't count it as a resource
                    }
                }
            }

            return resourceRevisions.ToReadOnlyDictionary();
        }

        /// <summary>
        /// Builds the DBL resource entries URL.
        /// </summary>
        /// <param name="baseUri">The base URI.</param>
        /// <param name="entryUid">The entry unique identifier.</param>
        /// <returns>
        /// A URL to access the resource entries or specific entry if <paramref name="entryUid" /> is specified.
        /// </returns>
        private static string BuildDBLResourceEntriesUrl(string baseUri, string entryUid = null)
        {
            var uri = new Uri(new Uri(baseUri), DBLResourceEntriesApiCall);
            var sb = new StringBuilder(uri.AbsoluteUri);
            if (!string.IsNullOrWhiteSpace(entryUid))
            {
                sb.Append("/" + entryUid);
            }

            return sb.ToString();
        }

        /// <summary>
        /// Creates the DBL URL with username query.
        /// </summary>
        /// <param name="resource">The resource.</param>
        /// <returns>
        /// The URL.
        /// </returns>
        private static string CreateDBLUrlWithUsernameQuery(SFInstallableDBLResource resource)
        {
            var uriBuilder = new UriBuilder(resource.DBLSourceUrl);
            var query = HttpUtils.ParseQueryString(uriBuilder.Query);
            // TODO: Add the username, and make this non-static
            // query["username"] = user.Name;
            uriBuilder.Query = query.ToString();
            return uriBuilder.ToString();
        }

        /// <summary>
        /// Converts the XML response to a list of Installable DBL Resources.
        /// </summary>
        /// <param name="baseUri">The base URI.</param>
        /// <param name="response">The response.</param>
        /// <param name="restClientFactory">The rest client factory.</param>
        /// <param name="fileSystemService">The file system service.</param>
        /// <param name="createdTimestamp">The created timestamp.</param>
        /// <param name="userSecret">The user secret.</param>
        /// <param name="paratextOptions">The paratext options.</param>
        /// <param name="projectDeleter">The project deleter.</param>
        /// <param name="migrationOperations">The migration operations.</param>
        /// <param name="passwordProvider">The password provider.</param>
        /// <returns>
        /// The Installable Resources.
        /// </returns>
        private static List<SFInstallableDBLResource> ConvertXmlResponseToInstallableDblResources(string baseUri, string response, IRESTClientFactory<IRESTClient> restClientFactory, IFileSystemService fileSystemService, DateTime createdTimestamp, UserSecret userSecret, ParatextOptions paratextOptions, IProjectDeleter projectDeleter, IMigrationOperations migrationOperations, IZippedResourcePasswordProvider passwordProvider)
        {
            var resources = new List<SFInstallableDBLResource>();
            XPathDocument doc;
            try
            {
                using var sr = new StringReader(response);
                doc = new XPathDocument(sr);
            }
            catch (XmlException)
            {
                // ignore exception and just return empty result - probably caused by partial result from poor connection to DBL
                return resources;
            }
            foreach (XPathNavigator nav in doc.CreateNavigator().Select("/document/resources/item"))
            {
                var name = DecodeNodeValue(nav, "name");
                var nameCommon = DecodeNodeValue(nav, "nameCommon");
                var fullname = DecodeNodeValue(nav, "fullname", nameCommon);
                var languageName = DecodeNodeValue(nav, "languageName");
                var id = DecodeNodeValue(nav, "id");
                var revision = DecodeNodeValue(nav, "revision");
                var permissionsChecksum = DecodeNodeValue(nav, "permissions-checksum");
                var manifestChecksum = DecodeNodeValue(nav, "p8z-manifest-checksum");
                var languageIdLDML = DecodeNodeValue(nav, "languageLDMLId");
                var languageIdCode = DecodeNodeValue(nav, "languageCode");
                var languageId = migrationOperations.DetermineBestLangIdToUseForResource(languageIdLDML, languageIdCode).Id;

                var url = BuildDBLResourceEntriesUrl(baseUri, id);
                var resource = new SFInstallableDBLResource(userSecret, paratextOptions, restClientFactory, fileSystemService, projectDeleter, migrationOperations, passwordProvider, baseUri)
                {
                    DisplayName = name,
                    Name = name,
                    FullName = fullname,
                    LanguageID = !string.IsNullOrEmpty(languageId) ? LanguageId.FromEthnologueCode(languageId) : LanguageIdHelper.FromCommonLanguageName(languageName),
                    DBLSourceUrl = url,
                    DBLEntryUid = id,
                    DBLRevision = int.Parse(revision),
                    PermissionsChecksum = permissionsChecksum,
                    ManifestChecksum = manifestChecksum,
                    CreatedTimestamp = createdTimestamp,
                };

                resource.LanguageName = MacroLanguageHelper.GetMacroLanguage(resource.LanguageID) ?? languageName;

                resources.Add(resource);
            }

            return resources;
        }

        /// <summary>
        /// Decodes the node value.
        /// </summary>
        /// <param name="nav">The XPath Navigator.</param>
        /// <param name="key">The key.</param>
        /// <param name="defaultValue">The default value.</param>
        /// <returns></returns>
        private static string DecodeNodeValue(XPathNavigator nav, string key, string defaultValue = "")
        {
            var val = nav.SelectSingleNode(key)?.Value;
            if (string.IsNullOrEmpty(val))
            {
                val = defaultValue;
            }

            return HttpUtils.HtmlDecode(val);
        }

        /// <summary>
        /// Creates the temporary source directory.
        /// </summary>
        /// <returns>
        /// The temporary directory path.
        /// </returns>
        private string CreateTempSourceDirectory()
        {
            string dirName = Path.Combine(temporaryDirectoryName, Name + '_' + Path.GetRandomFileName());

            // This following is an implementation of Paratext.Data.FileUtils.GetTemporaryDirectory(dirName)
            string path = Path.Combine(Path.GetTempPath(), dirName);
            if (!Directory.Exists(path))
            {
                // If we don't have the file system service, just ignore
                this._fileSystemService?.CreateDirectory(path);
            }

            return path;
        }

        /// <summary>
        /// Gets the file from DBL.
        /// </summary>
        /// <param name="filePath">The file path.</param>
        /// <returns>
        ///   <c>true</c>  if the file was retrieved successfully; otherwise, <c>false</c>.
        /// </returns>
        private bool GetFile(string filePath)
        {
            var client = this._restClientFactory.Create(string.Empty, ApplicationProduct.DefaultVersion);
            // TODO: Authentication for file downloads from DBL
            var dblUrlToResource = CreateDBLUrlWithUsernameQuery(this);
            return client.GetFile(dblUrlToResource, filePath);
        }

        /// <summary>
        /// An empty Paratext project deleter implementation.
        /// </summary>
        /// <seealso cref="Paratext.Data.Archiving.IProjectDeleter" />
        private class ParatextProjectDeleter : IProjectDeleter
        {
            /// <inheritdoc />
            public void DeleteProject(ScrText scrText)
            {
                throw new NotImplementedException("This method should not be used in SF context.");
            }
        }

        /// <summary>
        /// An empty Paratext migration options implementation.
        /// </summary>
        /// <seealso cref="Paratext.Data.Archiving.IMigrationOperations" />
        private class ParatextMigrationOperations : IMigrationOperations
        {
            /// <summary>
            /// Initializes a new instance of the <see cref="ParatextMigrationOperations"/> class.
            /// </summary>
            public ParatextMigrationOperations()
            {
                if (!Sldr.IsInitialized)
                {
                    // Always use offline mode in tests
                    Sldr.Initialize(true);
                }
            }

            /// <inheritdoc />
            public UnsupportedReason MigrateProjectIfNeeded(ScrText scrText)
            {
                return UnsupportedReason.Supported;
            }

            /// <inheritdoc />
            public LanguageId DetermineBestLangIdToUseForResource(string languageIdLDML, string languageIdDBL)
            {
                var langIdDBL = LanguageId.FromEthnologueCode(languageIdDBL);
                if (string.IsNullOrEmpty(languageIdLDML))
                {
                    return langIdDBL;
                }

                var langIdLDML = LanguageId.FromEthnologueCode(languageIdLDML);
                if (langIdLDML.Code == langIdDBL.Code)
                {
                    return langIdLDML;
                }
                else
                {
                    return langIdDBL;
                }
            }
        }


        /// <summary>
        /// An implementation of the Paratext zipped resource password provider.
        /// </summary>
        /// <seealso cref="Paratext.Data.ProjectFileAccess.IZippedResourcePasswordProvider" />
        private class ParatextZippedResourcePasswordProvider : IZippedResourcePasswordProvider
        {
            /// <summary>
            /// The cached password value.
            /// </summary>
            private string cachedValue;

            /// <summary>
            /// The paratext options.
            /// </summary>
            private readonly ParatextOptions _paratextOptions;

            /// <summary>
            /// Initializes a new instance of the <see cref="ParatextZippedResourcePasswordProvider"/> class.
            /// </summary>
            /// <param name="paratextOptions">The paratext options.</param>
            internal ParatextZippedResourcePasswordProvider(ParatextOptions paratextOptions)
            {
                this._paratextOptions = paratextOptions;
            }

            /// <inheritdoc />
            public string GetPassword()
            {
                // We can handle zip files with no password (for testing)
                if (this._paratextOptions == null
                    || string.IsNullOrWhiteSpace(this._paratextOptions.ResourcePasswordBase64)
                    || string.IsNullOrWhiteSpace(this._paratextOptions.ResourcePasswordHash))
                {
                    return string.Empty;
                }

                if (cachedValue == null)
                {
                    cachedValue = StringUtils.DecryptStringFromBase64(this._paratextOptions.ResourcePasswordBase64, this._paratextOptions.ResourcePasswordHash);
                }

                return cachedValue;
            }
        }
    }
}
