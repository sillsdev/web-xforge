using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Security;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using System.Xml;
using System.Xml.XPath;
using IdentityModel;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Options;
using Newtonsoft.Json.Linq;
using Paratext.Data;
using Paratext.Data.Encodings;
using Paratext.Data.Languages;
using Paratext.Data.RegistryServerAccess;
using Paratext.Data.Repository;
using Paratext.Data.Users;
using PtxUtils;
using SIL.ObjectModel;
using SIL.XForge.Configuration;
using SIL.XForge.DataAccess;
using SIL.XForge.Models;
using SIL.XForge.Realtime;
using SIL.XForge.Scripture.Models;
using SIL.XForge.Services;
using SIL.XForge.Utils;

namespace SIL.XForge.Scripture.Services
{
    /// <summary>
    /// This class contains methods for interacting with the Paratext web service APIs.
    ///
    /// TODO: Implement progress reporting. PT uses singleton classes to handle progress. Implement ProgressDisplay
    /// interface and call Progress.Mgr.SetDisplay() to get progress reports. Make sure that you call SetDisplay() right
    /// before you call any ParatextData code. The Progress.Mgr instance has a ThreadStatic attribute in order to make
    /// it thread-safe. If anything is awaited, then a different thread might take over for the call stack. If this
    /// occurs, a different ProgressDisplay instance will receive the progress reports.
    /// </summary>
    public class ParatextService : DisposableBase, IParatextService
    {
        private readonly IOptions<ParatextOptions> _paratextOptions;
        private readonly IRepository<UserSecret> _userSecret;
        private readonly IRealtimeService _realtimeService;
        private readonly IOptions<SiteOptions> _siteOptions;
        private readonly IFileSystemService _fileSystemService;
        private readonly HttpClientHandler _httpClientHandler;
        private readonly HttpClient _registryClient;
        private readonly IExceptionHandler _exceptionHandler;
        private readonly bool _useDevServer;

        public ParatextService(IHostingEnvironment env, IOptions<ParatextOptions> paratextOptions,
            IRepository<UserSecret> userSecret, IRealtimeService realtimeService, IExceptionHandler exceptionHandler,
            IOptions<SiteOptions> siteOptions, IFileSystemService fileSystemService)
        {
            _paratextOptions = paratextOptions;
            _userSecret = userSecret;
            _realtimeService = realtimeService;
            _exceptionHandler = exceptionHandler;
            _siteOptions = siteOptions;
            _fileSystemService = fileSystemService;

            // TODO: use RegistryServer from ParatextData instead of calling registry API directly?
            _httpClientHandler = new HttpClientHandler();
            _registryClient = new HttpClient(_httpClientHandler);
            if (env.IsDevelopment() || env.IsEnvironment("Testing"))
            {
                _httpClientHandler.ServerCertificateCustomValidationCallback
                    = HttpClientHandler.DangerousAcceptAnyServerCertificateValidator;
                _registryClient.BaseAddress = new Uri("https://registry-dev.paratext.org");
                _useDevServer = true;
            }
            else
            {
                _registryClient.BaseAddress = new Uri("https://registry.paratext.org");
                _useDevServer = false;
            }
            _registryClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        }

        public void Init()
        {
            string syncDir = Path.Combine(_siteOptions.Value.SiteDir, "sync");
            if (!_fileSystemService.DirectoryExists(syncDir))
                _fileSystemService.CreateDirectory(syncDir);

            WritingSystemRepository.Initialize();

            RegistryU.Implementation = new DotNetCoreRegistry();

            // TODO: not sure if using ScrTextCollection is the best idea for a server, since it loads all existing
            // ScrTexts into memory when it is initialized. Possibly use a different implementation, see
            // ScrTextCollectionServer class in DataAccessServer.
            ScrTextCollection.Initialize(syncDir, false);

            string usfmStylesFileName = "usfm.sty";
            string source = Path.Combine("/home/vagrant/src/web-xforge/src/SIL.XForge.Scripture", usfmStylesFileName);
            string target = Path.Combine(syncDir, usfmStylesFileName);
            if (!File.Exists(target))
                File.Copy(source, target);
        }

        public async Task<IReadOnlyList<ParatextProject>> GetProjectsAsync(UserSecret userSecret)
        {
            var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
            Claim usernameClaim = accessToken.Claims.FirstOrDefault(c => c.Type == "username");
            string username = usernameClaim?.Value;
            var source = new SFInternetSharedRepositorySource(_useDevServer, userSecret);
            var repos = new Dictionary<string, UserRoles>();
            foreach (SharedRepository repo in source.GetRepositories())
            {
                string projId = repo.SendReceiveId;
                repos[projId] = repo.SourceUsers.GetRole(username);
            }
            Dictionary<string, SFProject> existingProjects = (await _realtimeService.QuerySnapshots<SFProject>()
                .Where(p => repos.Keys.Contains(p.ParatextId))
                .ToListAsync()).ToDictionary(p => p.ParatextId);
            // TODO: use RegistryServer from ParatextData instead of calling registry API directly?
            string response = await CallApiAsync(_registryClient, userSecret, HttpMethod.Get, "projects");
            var projectArray = JArray.Parse(response);
            var projects = new List<ParatextProject>();
            foreach (JToken projectObj in projectArray)
            {
                JToken identificationObj = projectObj["identification_systemId"]
                    .FirstOrDefault(id => (string)id["type"] == "paratext");
                if (identificationObj == null)
                    continue;
                string paratextId = (string)identificationObj["text"];
                if (!repos.TryGetValue(paratextId, out UserRoles role))
                    continue;

                // determine if the project is connectable, i.e. either the project exists and the user hasn't been
                // added to the project, or the project doesn't exist and the user is the administrator
                bool isConnectable;
                bool isConnected = false;
                string projectId = null;
                if (existingProjects.TryGetValue(paratextId, out SFProject project))
                {
                    projectId = project.Id;
                    isConnected = true;
                    isConnectable = !project.UserRoles.ContainsKey(userSecret.Id);
                }
                else if (role == UserRoles.Administrator)
                {
                    isConnectable = true;
                }
                else
                {
                    isConnectable = false;
                }

                projects.Add(new ParatextProject
                {
                    ParatextId = paratextId,
                    Name = (string)projectObj["identification_name"],
                    ShortName = (string)projectObj["identification_shortName"],
                    LanguageTag = (string)projectObj["language_ldml"],
                    ProjectId = projectId,
                    IsConnectable = isConnectable,
                    IsConnected = isConnected
                });
            }
            return projects.OrderBy(p => p.Name, StringComparer.InvariantCulture).ToArray();
        }

        public async Task<Attempt<string>> TryGetProjectRoleAsync(UserSecret userSecret, string paratextId)
        {
            if (userSecret.ParatextTokens == null)
                return Attempt.Failure((string)null);
            try
            {
                var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
                Claim subClaim = accessToken.Claims.FirstOrDefault(c => c.Type == JwtClaimTypes.Subject);
                // TODO: use RegistryServer from ParatextData instead of calling registry API directly?
                string response = await CallApiAsync(_registryClient, userSecret, HttpMethod.Get,
                    $"projects/{paratextId}/members/{subClaim.Value}");
                var memberObj = JObject.Parse(response);
                return Attempt.Success((string)memberObj["role"]);
            }
            catch (HttpRequestException)
            {
                return Attempt.Failure((string)null);
            }
        }

        public string GetParatextUsername(UserSecret userSecret)
        {
            if (userSecret.ParatextTokens == null)
                return null;
            var accessToken = new JwtSecurityToken(userSecret.ParatextTokens.AccessToken);
            Claim usernameClaim = accessToken.Claims.FirstOrDefault(c => c.Type == "username");
            return usernameClaim?.Value;
        }

        public async Task<IReadOnlyDictionary<string, string>> GetProjectRolesAsync(UserSecret userSecret,
            string projectId)
        {
            // TODO: use RegistryServer from ParatextData instead of calling registry API directly?
            string response = await CallApiAsync(_registryClient, userSecret, HttpMethod.Get,
                $"projects/{projectId}/members");
            var members = JArray.Parse(response);
            return members.OfType<JObject>()
                .Where(m => !string.IsNullOrEmpty((string)m["userId"]) && !string.IsNullOrEmpty((string)m["role"]))
                .ToDictionary(m => (string)m["userId"], m => (string)m["role"]);
        }

        public IReadOnlyList<int> GetBooks(string projectId)
        {
            // TODO: this is a guess at how to implement this method
            ScrText scrText = ScrTextCollection.FindById(projectId);
            if (scrText == null)
                return Array.Empty<int>();
            return scrText.Settings.BooksPresentSet.SelectedBookNumbers.ToArray();
        }

        public string GetBookText(string projectId, int bookNum)
        {
            // TODO: this is a guess at how to implement this method
            ScrText scrText = ScrTextCollection.GetById(projectId);
            string usfm = scrText.GetText(bookNum);
            return UsfmToUsx.ConvertToXmlString(scrText, bookNum, usfm, false);
        }

        public void PutBookText(string projectId, int bookNum, string usx)
        {
            // TODO: this is a guess at how to implement this method
            ScrText scrText = ScrTextCollection.GetById(projectId);
            var doc = new XmlDocument
            {
                PreserveWhitespace = true
            };
            doc.LoadXml(usx);
            UsxFragmenter.FindFragments(scrText.ScrStylesheet(bookNum), doc.CreateNavigator(),
                XPathExpression.Compile("*[false()]"), out string usfm);
            scrText.PutText(bookNum, 0, false, usfm, null);
        }

        public string GetNotes(string projectId, int bookNum)
        {
            // TODO: get notes using CommentManager, see DataAccessServer.HandleNotesRequest for an example
            // should return some data structure instead of XML
            throw new NotImplementedException();
        }

        public void PutNotes(string projectId, string notesText)
        {
            // TODO: save notes using CommentManager, see DataAccessServer.HandleNotesUpdateRequest for an example
            // should accept some data structure instead of XML
            throw new NotImplementedException();
        }

        public void SendReceive(UserSecret userSecret, IEnumerable<string> projectIds)
        {
            // TODO: this is a guess at how to implement this method
            var source = new SFInternetSharedRepositorySource(_useDevServer, userSecret);
            SharedRepository[] repos = source.GetRepositories().ToArray();
            var sharedProjects = new List<SharedProject>();
            foreach (string projectId in projectIds)
            {
                SharedRepository repo = repos.First(r => r.SendReceiveId == projectId);
                SharedProject sharedProject = SharingLogic.CreateSharedProject(projectId, repo.ScrTextName, source,
                    repos);
                sharedProjects.Add(sharedProject);
            }
            SharingLogic.ShareChanges(sharedProjects, source, out List<SendReceiveResult> results, sharedProjects);
        }

        private async Task RefreshAccessTokenAsync(UserSecret userSecret)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, "api8/token");

            ParatextOptions options = _paratextOptions.Value;
            var requestObj = new JObject(
                new JProperty("grant_type", "refresh_token"),
                new JProperty("client_id", options.ClientId),
                new JProperty("client_secret", options.ClientSecret),
                new JProperty("refresh_token", userSecret.ParatextTokens.RefreshToken));
            request.Content = new StringContent(requestObj.ToString(), Encoding.UTF8, "application/json");
            HttpResponseMessage response = await _registryClient.SendAsync(request);
            await _exceptionHandler.EnsureSuccessStatusCode(response);

            string responseJson = await response.Content.ReadAsStringAsync();
            var responseObj = JObject.Parse(responseJson);
            userSecret.ParatextTokens = new Tokens
            {
                AccessToken = (string)responseObj["access_token"],
                RefreshToken = (string)responseObj["refresh_token"],
            };
            await _userSecret.UpdateAsync(userSecret, b => b.Set(u => u.ParatextTokens, userSecret.ParatextTokens));
        }

        private async Task<string> CallApiAsync(HttpClient client, UserSecret userSecret, HttpMethod method,
            string url, string content = null)
        {
            if (userSecret == null)
                throw new SecurityException("The current user is not signed into Paratext.");

            bool expired = !userSecret.ParatextTokens.ValidateLifetime();
            bool refreshed = false;
            while (!refreshed)
            {
                if (expired)
                {
                    await RefreshAccessTokenAsync(userSecret);
                    refreshed = true;
                }

                var request = new HttpRequestMessage(method, $"api8/{url}");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer",
                    userSecret.ParatextTokens.AccessToken);
                if (content != null)
                    request.Content = new StringContent(content);
                HttpResponseMessage response = await client.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    return await response.Content.ReadAsStringAsync();
                }
                else if (response.StatusCode == HttpStatusCode.Unauthorized)
                {
                    expired = true;
                }
                else
                {
                    string error = await response.Content.ReadAsStringAsync();
                    throw new HttpRequestException(
                        $"HTTP Request error, Code: {response.StatusCode}, Content: {error}");
                }
            }

            throw new SecurityException("The current user's Paratext access token is invalid.");
        }

        protected override void DisposeManagedResources()
        {
            _registryClient.Dispose();
            _httpClientHandler.Dispose();
        }
    }
}
