using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using SecretSanta;
using SecretSanta.Other;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddRazorPages();

builder.Services.AddTransient<IStartupFilter, MigrationStartupFilter<SantaContext>>();

#region Authentication
builder.Services.AddAuthentication(o => {
    o.DefaultScheme = "AdminAuthenticationHandler";
})
.AddScheme<AdminAuthenticationOptions, AdminAuthenticationHandler>("AdminAuthenticationHandler", o => { });
#endregion

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
}

app.UseStaticFiles();

app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.MapRazorPages();

app.MapControllers();

using (var db = new SantaContext())
    db.Database.Migrate();

app.Run();