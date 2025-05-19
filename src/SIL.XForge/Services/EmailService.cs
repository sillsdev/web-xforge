using System;
using System.Threading.Tasks;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;
using SIL.XForge.Configuration;

namespace SIL.XForge.Services;

public class EmailService(IOptions<SiteOptions> options, ILogger<EmailService> logger) : IEmailService
{
    public async Task SendEmailAsync(string email, string subject, string body)
    {
        SiteOptions siteOptions = options.Value;
        string fromAddress = siteOptions.EmailFromAddress;
        string title = siteOptions.Name;
        using var mimeMessage = new MimeMessage();
        mimeMessage.From.Add(new MailboxAddress(title, fromAddress));
        mimeMessage.To.Add(new MailboxAddress(string.Empty, email));
        mimeMessage.Subject = subject;

        var bodyBuilder = new BodyBuilder { HtmlBody = body };
        mimeMessage.Body = bodyBuilder.ToMessageBody();

        if (siteOptions.SendEmail)
        {
            using var client = new SmtpClient();
            await client.ConnectAsync(
                siteOptions.SmtpServer,
                Convert.ToInt32(siteOptions.PortNumber),
                SecureSocketOptions.None
            );
            await client.SendAsync(mimeMessage);
            await client.DisconnectAsync(true);
        }

        logger.LogInformation("Email Sent\n{mimeMessage}", mimeMessage.ToString());
    }

    public bool ValidateEmail(string? email)
    {
        try
        {
            // The Address property setter called by the constructor performs the validation logic.
            _ = new MailboxAddress(string.Empty, email);
            return true;
        }
        catch (Exception e) when (e is ArgumentNullException or ParseException)
        {
            return false;
        }
    }
}
