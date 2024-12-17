using System;
using System.IO;
using System.Reflection;
using Microsoft.OpenApi.Models;
using SIL.IO;

namespace Microsoft.Extensions.DependencyInjection;

public static class ApiDocumentationExtensions
{
    public static IServiceCollection AddApiDocumentation(this IServiceCollection services)
    {
        // Use JSON.NET's converters and configuration for types
        services.AddSwaggerGenNewtonsoftSupport();

        // Generate the OpenAPI file at /swagger/v1/swagger.json
        services.AddSwaggerGen(options =>
        {
            // Hide any obsolete endpoints
            options.IgnoreObsoleteActions();

            // Add all other Web API endpoints
            options.SwaggerDoc(
                "v1",
                new OpenApiInfo
                {
                    Title = "Scripture Forge API",
                    Version = "v1",
                    Description = "This API provides services for the Scripture Forge front end.",
                    License = new OpenApiLicense
                    {
                        Name = "MIT License",
                        Url = new Uri("https://github.com/sillsdev/web-xforge/blob/master/LICENSE.txt"),
                    },
                }
            );

            // Add the documentation XML file, if it exists
            string xmlFilename = $"{Assembly.GetExecutingAssembly().GetName().Name}.xml";
            string xmlPath = Path.Combine(AppContext.BaseDirectory, xmlFilename);
            if (RobustFile.Exists(xmlPath))
            {
                options.IncludeXmlComments(xmlPath, includeControllerXmlComments: true);
            }

            // Add the security definition to allow a bearer token
            options.AddSecurityDefinition(
                "Bearer",
                new OpenApiSecurityScheme
                {
                    Description =
                        "Enter 'Bearer' [space] and then the token from Scripture Forge into the field below.",
                    Name = "Authorization",
                    In = ParameterLocation.Header,
                    Type = SecuritySchemeType.ApiKey,
                    Scheme = "Bearer",
                }
            );

            // Add the security requirement to implement bearer token support
            options.AddSecurityRequirement(
                new OpenApiSecurityRequirement
                {
                    {
                        new OpenApiSecurityScheme
                        {
                            Reference = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" },
                        },
                        Array.Empty<string>()
                    },
                }
            );
        });
        return services;
    }
}
