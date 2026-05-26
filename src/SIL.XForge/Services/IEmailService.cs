using System.Threading;
using System.Threading.Tasks;

namespace SIL.XForge.Services;

public interface IEmailService
{
    Task SendEmailAsync(string email, string subject, string body, CancellationToken cancellationToken);
    bool ValidateEmail(string? email);
}
