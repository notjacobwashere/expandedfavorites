// SPDX-License-Identifier: GPL-3.0-or-later
using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;

internal static class Launcher
{
    private static int Main(string[] args)
    {
        string directory = Path.Combine(Path.GetTempPath(), "ExpandedFavorites-" + Guid.NewGuid().ToString("N"));
        int exitCode = 1;
        try
        {
            Directory.CreateDirectory(directory);
            string zip = Path.Combine(directory, "payload.zip");
            using (Stream resource = Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))
            using (FileStream output = File.Create(zip))
                resource.CopyTo(output);
            string payload = Path.Combine(directory, "payload");
            ZipFile.ExtractToDirectory(zip, payload);
            string script = Path.Combine(payload, "Install.ps1");
            string powershell = Path.Combine(Environment.SystemDirectory, @"WindowsPowerShell\v1.0\powershell.exe");
            var start = new ProcessStartInfo(powershell,
                "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + script + "\" -Payload \"" + payload + "\"");
            start.UseShellExecute = false;
            using (Process child = Process.Start(start))
            {
                child.WaitForExit();
                exitCode = child.ExitCode;
            }
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.Message);
        }
        finally
        {
            try { Directory.Delete(directory, true); }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }
        }
        if (Array.IndexOf(args, "--no-pause") < 0 && !Console.IsInputRedirected)
        {
            Console.WriteLine("Press Enter to close.");
            Console.ReadLine();
        }
        return exitCode;
    }
}
