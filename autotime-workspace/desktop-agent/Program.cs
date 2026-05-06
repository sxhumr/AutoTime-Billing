using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using System.Diagnostics;

class Program
{
    // ── Windows API Imports ────────────────────────────────────────────────────
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    // ── HTTP Client (Singleton for performance) ─────────────────────────────────
    static readonly HttpClient client = new HttpClient { Timeout = TimeSpan.FromSeconds(5) };

    // ── Configuration ──────────────────────────────────────────────────────────
    const string BackendUrl = "http://127.0.0.1:5000/api/log-activity";
    const int PollIntervalMs = 5000;
    const int MinDurationMs = 5000; // Ignore anything shorter than 5 seconds

    // Applications to exclude from tracking
    static readonly HashSet<string> BlacklistedApps = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "msedge", "firefox", "chrome", "taskmgr", "explorer", "cmd", "powershell", "slack", "whatsapp", "windowsterminal"
    };

    static async Task Main(string[] args)
    {
        Console.Title = "AutoTime Activity Agent";
        Console.WriteLine("╔══════════════════════════════════════════════════════╗");
        Console.WriteLine("║           AutoTime Agent — Tracking Active           ║");
        Console.WriteLine("╚══════════════════════════════════════════════════════╝");
        
        string lastTitle = "";
        string lastAppName = "";
        DateTime sessionStart = DateTime.UtcNow;

        while (true)
        {
            try
            {
                GetActiveWindowInfo(out string currentTitle, out string currentApp);

                // Check if the focus has shifted to a new window or app
                if (currentTitle != lastTitle || currentApp != lastAppName)
                {
                    // Process the previous session if it was valid
                    if (!string.IsNullOrWhiteSpace(lastTitle) && !IsBlacklisted(lastAppName))
                    {
                        DateTime sessionEnd = DateTime.UtcNow;
                        double durationMs = (sessionEnd - sessionStart).TotalMilliseconds;

                        if (durationMs >= MinDurationMs)
                        {
                            await SendToBackend(lastAppName, lastTitle, sessionStart, sessionEnd, durationMs);
                        }
                    }

                    // Reset markers for the new active window
                    lastTitle = currentTitle;
                    lastAppName = currentApp;
                    sessionStart = DateTime.UtcNow;

                    if (!IsBlacklisted(currentApp))
                    {
                        Log($"Tracking: [{currentApp}] {Truncate(currentTitle, 50)}", ConsoleColor.White);
                    }
                }
            }
            catch (Exception ex)
            {
                Log($"Critical Loop Error: {ex.Message}", ConsoleColor.Red);
            }

            await Task.Delay(PollIntervalMs);
        }
    }

    private static void GetActiveWindowInfo(out string title, out string appName)
    {
        var buffer = new StringBuilder(256);
        IntPtr handle = GetForegroundWindow();
        
        if (GetWindowText(handle, buffer, 256) > 0) 
            title = buffer.ToString();
        else 
            title = "Unknown";

        try
        {
            GetWindowThreadProcessId(handle, out uint pid);
            using var process = Process.GetProcessById((int)pid);
            appName = process.ProcessName;
        }
        catch 
        { 
            appName = "Unknown"; 
        }
    }

    private static bool IsBlacklisted(string appName) => BlacklistedApps.Contains(appName);

    private static async Task SendToBackend(string appName, string windowTitle, DateTime start, DateTime end, double durationMs)
    {
        // Data structure matches the server.js expectations exactly
        var payload = new
        {
            appName,
            windowTitle,
            startTime = start.ToString("o"), // ISO 8601
            endTime = end.ToString("o"),
            durationMs
        };

        try
        {
            string json = JsonSerializer.Serialize(payload);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            
            var response = await client.PostAsync(BackendUrl, content);
            
            if (response.IsSuccessStatusCode)
            {
                Log($"[SUCCESS] Logged {Math.Round(durationMs/1000)}s for {appName}", ConsoleColor.Green);
            }
            else
            {
                Log($"[SERVER ERROR] {response.StatusCode}", ConsoleColor.Yellow);
            }
        }
        catch (Exception ex)
        {
            Log($"[NETWORK ERROR] Check if server.js is running: {ex.Message}", ConsoleColor.Red);
        }
    }

    private static void Log(string message, ConsoleColor color)
    {
        Console.ForegroundColor = color;
        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {message}");
        Console.ResetColor();
    }

    private static string Truncate(string value, int max)
    {
        return value.Length <= max ? value : value.Substring(0, max) + "...";
    }
}