using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;

class Program
{
    // ── Windows API ────────────────────────────────────────────────────────────
    [DllImport("user32.dll")]
    static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    // ── HTTP Client ────────────────────────────────────────────────────────────
    static readonly HttpClient client = new HttpClient
    {
        Timeout = TimeSpan.FromSeconds(10)
    };

    // ── Config ─────────────────────────────────────────────────────────────────
    const string BackendUrl       = "http://127.0.0.1:5000/api/activity";
    const int    PollIntervalMs   = 5000;   // how often we check the active window
    const int    MinDurationSecs  = 5;      // ignore windows open for less than this

    // Applications that should NEVER be tracked (Privacy Mode blacklist)
    static readonly HashSet<string> BlacklistedApps = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        //"chrome",
        "msedge",
        "firefox",
        "notepad",       // remove if you want notepad tracked
        "taskmgr",
        "explorer",
        "cmd",
        "powershell",
        "windowsterminal",
        "slack",
        "whatsapp",
    };

    // ── Entry Point ────────────────────────────────────────────────────────────
    static async Task Main(string[] args)
    {
        Console.WriteLine("╔══════════════════════════════════════╗");
        Console.WriteLine("║       AutoTime Agent — Starting      ║");
        Console.WriteLine("╚══════════════════════════════════════╝");
        Console.WriteLine($"Backend  : {BackendUrl}");
        Console.WriteLine($"Poll     : every {PollIntervalMs / 1000}s");
        Console.WriteLine($"Min time : {MinDurationSecs}s\n");

        string   lastTitle    = "";
        string   lastAppName  = "";
        DateTime windowStart  = DateTime.Now;

        while (true)
        {
            try
            {
                GetActiveWindowInfo(out string currentTitle, out string currentApp);

                // ── Window has changed ─────────────────────────────────────────
                if (currentTitle != lastTitle)
                {
                    // Send the previous window's data if it qualifies
                    if (!string.IsNullOrWhiteSpace(lastTitle)
                        && lastTitle != "Unknown"
                        && !IsBlacklisted(lastAppName))
                    {
                        int seconds = (int)(DateTime.Now - windowStart).TotalSeconds;

                        if (seconds >= MinDurationSecs)
                        {
                            Log($"Captured: [{lastAppName}] \"{lastTitle}\" — {seconds}s", ConsoleColor.Cyan);
                            await SendToBackend(lastAppName, lastTitle, seconds);
                        }
                        else
                        {
                            Log($"Skipped (too short): [{lastAppName}] {seconds}s", ConsoleColor.DarkGray);
                        }
                    }

                    // Start tracking the new window
                    lastTitle   = currentTitle;
                    lastAppName = currentApp;
                    windowStart = DateTime.Now;

                    if (IsBlacklisted(currentApp))
                        Log($"Privacy: [{currentApp}] is blacklisted — not tracking", ConsoleColor.Yellow);
                    else
                        Log($"New window: [{currentApp}] \"{currentTitle}\"", ConsoleColor.White);
                }
                else
                {
                    // Still on the same window — just log elapsed
                    int elapsed = (int)(DateTime.Now - windowStart).TotalSeconds;
                    Log($"Active: [{currentApp}] \"{Truncate(currentTitle, 60)}\" — {elapsed}s", ConsoleColor.DarkGray);
                }
            }
            catch (Exception ex)
            {
                Log($"Loop error: {ex.Message}", ConsoleColor.Red);
            }

            await Task.Delay(PollIntervalMs);
        }
    }

    // ── Get Active Window Title + Process Name ─────────────────────────────────
    static void GetActiveWindowInfo(out string title, out string appName)
    {
        var buffer = new StringBuilder(256);
        IntPtr handle = GetForegroundWindow();

        if (GetWindowText(handle, buffer, 256) > 0)
        {
            title = buffer.ToString();
        }
        else
        {
            title = "Unknown";
        }

        try
        {
            GetWindowThreadProcessId(handle, out uint pid);
            var process = System.Diagnostics.Process.GetProcessById((int)pid);
            appName = process.ProcessName;
        }
        catch
        {
            appName = "Unknown";
        }
    }

    // ── Blacklist Check ────────────────────────────────────────────────────────
    static bool IsBlacklisted(string appName)
    {
        return BlacklistedApps.Contains(appName);
    }

    // ── Send Activity to Backend ───────────────────────────────────────────────
    static async Task SendToBackend(string appName, string windowTitle, int durationSeconds)
    {
        var payload = new
        {
            appName,
            windowTitle,
            durationSeconds,
            timestamp = DateTime.UtcNow.ToString("o")   // ISO 8601
        };

        string json    = JsonSerializer.Serialize(payload);
        var    content = new StringContent(json, Encoding.UTF8, "application/json");

        try
        {
            HttpResponseMessage response = await client.PostAsync(BackendUrl, content);

            if (response.IsSuccessStatusCode)
            {
                Log($"Sent OK ({response.StatusCode}): [{appName}] {durationSeconds}s", ConsoleColor.Green);
            }
            else
            {
                string body = await response.Content.ReadAsStringAsync();
                Log($"Server error {response.StatusCode}: {body}", ConsoleColor.Red);
            }
        }
        catch (TaskCanceledException)
        {
            Log("Request timed out — backend not responding", ConsoleColor.Red);
        }
        catch (HttpRequestException ex)
        {
            Log($"Network error — is the backend running? {ex.Message}", ConsoleColor.Red);
        }
        catch (Exception ex)
        {
            Log($"Unexpected send error: {ex.Message}", ConsoleColor.Red);
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────
    static void Log(string message, ConsoleColor color = ConsoleColor.Gray)
    {
        Console.ForegroundColor = color;
        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {message}");
        Console.ResetColor();
    }

    static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
            return value;
        return value.Substring(0, maxLength) + "...";
    }
}