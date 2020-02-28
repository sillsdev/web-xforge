using System;
using System.Collections.Generic;
using Paratext.Data;
using Paratext.Data.Repository;
using SIL.Reflection;
using SIL.XForge.Models;

namespace SIL.XForge.Scripture.Services
{
    public class SFInternetSharedRepositorySource : InternetSharedRepositorySource, IInternetSharedRepositorySource
    {
        private const string DevUrl = "https://archives-dev.paratext.org/send_receive_server/api80/";
        private const string ProdUrl = "https://archives.paratext.org/send_receive_server/api80/";

        public SFInternetSharedRepositorySource(bool useDevServer, UserSecret userSecret)
            : base(useDevServer ? DevUrl : ProdUrl)
        {
            // TODO: this won't work, because authentication is already set in the base constructor
            client.JwtToken = userSecret.ParatextTokens.AccessToken;

            // RESTClient only uses the jwtToken if authentication is null;
            ReflectionHelper.SetField(client, "authentication", null);
        }
        public void SetToken(string jwtToken)
        {
            throw new NotImplementedException();
        }
    }

    class JwtInternetSharedRepositorySource : InternetSharedRepositorySource, IInternetSharedRepositorySource
    {
        // public JwtInternetSharedRepositorySource(string jwtToken)
        // {
        //     client.JwtToken = jwtToken;
        //     // RESTClient only uses the jwtToken if authentication is null;
        //     ReflectionHelper.SetField(client, "authentication", null);

        //      }
        public void SetToken(string jwtToken)
        {
            client.JwtToken = jwtToken;
            // RESTClient only uses the jwtToken if authentication is null;
            ReflectionHelper.SetField(client, "authentication", null);

        }
    }

    public interface IInternetSharedRepositorySource
    {
        IEnumerable<SharedRepository> GetRepositories();
        string[] Pull(string repository, SharedRepository pullRepo);
        void SetToken(string jwtToken);
    }

    class JwtRESTClient : RESTClient
    {
        public JwtRESTClient(string baseUri, string applicationProductVersion, string jwtToken) : base(baseUri, applicationProductVersion)
        {
            this.JwtToken = jwtToken;
            ReflectionHelper.SetField(this, "authentication", null);
        }
    }
}
