using System;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Collections.Generic;
using Jering.Javascript.NodeJS;

namespace SIL.XForge.Scripture.Models
{
    public static class SFProjectDomain
    {
        public const string Texts = "texts";
        public const string ProjectUserConfigs = "project_user_configs";
        public const string Questions = "questions";
        public const string Answers = "answers";
        public const string AnswerComments = "answer_comments";
        public const string Likes = "likes";
    }

    public static class Operation
    {
        public const string Create = "create";
        public const string Edit = "edit";
        public const string Delete = "delete";
        public const string View = "view";
        public const string EditOwn = "edit_own";
        public const string DeleteOwn = "delete_own";
        public const string ViewOwn = "view_own";
    }
}

public interface ISFRightsService
{
    bool roleHasRight(string role, string projectDomain, string operation);
}

namespace SIL.XForge.Services
{
    public class SFRightsService : ISFRightsService
    {
        private readonly Dictionary<string, string[]> rights;

        public SFRightsService()
        {
            string root = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            string path = Path.Combine(root, "RealtimeServer", "lib", "cjs", "scriptureforge", "models", "sf-project-rights-mapping-commonjs");
            var task = StaticNodeJSService.InvokeFromFileAsync<Dictionary<string, string[]>>(path);
            task.Wait();
            Console.WriteLine(string.Join("\n", task.Result.Select(x => x.Key + "=" + string.Join(",", x.Value)).ToArray()));
            this.rights = task.Result;
        }

        public bool roleHasRight(string role, string projectDomain, string operation)
        {
            if (this.rights.TryGetValue(role, out string[] rights))
            {
                return rights.Contains(projectDomain + "." + operation);
            }
            return false;
        }
    }
}
